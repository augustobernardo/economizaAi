import type { Transformer } from 'grammy';

declare const marca: unique symbol;

/**
 * Texto já seguro para `parse_mode: 'HTML'`. Só nasce aqui (tag `html`,
 * `escaparHtml`, `juntarHtml`): o compilador barra `string` crua numa resposta.
 */
export type Html = string & { readonly [marca]: true };

/** Único ponto de criação de `Html`; todo valor que passa por aqui já é seguro. */
const confiavel = (texto: string): Html => texto as Html;

/** Escapa o que o HTML do Telegram interpreta; o `&` vem primeiro para não escapar duas vezes. */
export function escaparHtml(texto: string): Html {
  return confiavel(
    texto
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;'),
  );
}

type Interpolavel = string | number | readonly Html[];

/**
 * Proíbe `Html` solto (em runtime é só string e seria escapado de novo) e
 * `any` (um array `any` entraria sem escape). `0 extends 1 & X` só vale para `any`.
 */
type SemHtmlSolto<T> = {
  [K in keyof T]: 0 extends 1 & T[K] ? never : T[K] extends Html ? never : T[K];
};

/**
 * Tag de template: o literal é confiável (tags fixas); toda interpolação
 * `string`/`number` é escapada e `Html[]` entra como está. Para aninhar um
 * `Html` único, use `${[parte]}` (o tipo em runtime some, o array não).
 */
export function html<T extends readonly Interpolavel[]>(
  partes: TemplateStringsArray,
  ...valores: T & SemHtmlSolto<T>
): Html {
  let saida = partes[0] ?? '';
  for (const [i, valor] of valores.entries()) {
    saida +=
      (Array.isArray(valor) ? valor.join('') : escaparHtml(String(valor))) +
      (partes[i + 1] ?? '');
  }
  return confiavel(saida);
}

/** Junta partes já seguras; o separador (texto cru) é escapado. */
export function juntarHtml(
  partes: readonly Html[],
  separador: string = '\n',
): Html {
  return confiavel(partes.join(escaparHtml(separador)));
}

const METODOS_COM_TEXTO = new Set([
  'sendMessage',
  'editMessageText',
  'sendDocument',
]);

/** Liga `parse_mode: 'HTML'` em toda mensagem/legenda enviada pelo bot. */
export const comHtml: Transformer = (prev, method, payload, signal) =>
  prev(
    method,
    METODOS_COM_TEXTO.has(method) && !('parse_mode' in payload)
      ? { ...payload, parse_mode: 'HTML' }
      : payload,
    signal,
  );
