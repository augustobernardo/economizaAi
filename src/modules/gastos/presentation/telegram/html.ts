import type { Transformer } from 'grammy';

/** Escapa o que o HTML do Telegram interpreta; o `&` vem primeiro para não escapar duas vezes. */
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Texto puro para popups (`answerCallbackQuery`): tira as tags e qualquer `<`/`>` que sobrar. */
export function semTags(texto: string): string {
  return texto.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
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
