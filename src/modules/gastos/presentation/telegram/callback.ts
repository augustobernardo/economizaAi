import { z } from 'zod';

export const PREFIXO_DESFAZER = 'd:';
const uuid = z.uuid();

export function montarCallbackDesfazer(registroId: string): string {
  return `${PREFIXO_DESFAZER}${registroId}`;
}

/** Devolve o registroId se o callback for válido; `null` para qualquer outra coisa. */
export function lerCallbackDesfazer(data: string | undefined): string | null {
  return lerUuid(PREFIXO_DESFAZER, data);
}

export const PREFIXO_EXPORTAR = 'e:';

export function montarCallbackExportar(mesRelativo: 0 | -1): string {
  return `${PREFIXO_EXPORTAR}${mesRelativo}`;
}

/** `0` (mês atual), `-1` (mês anterior) ou `null` para qualquer outra coisa. */
export function lerCallbackExportar(data: string | undefined): 0 | -1 | null {
  if (data === 'e:0') return 0;
  if (data === 'e:-1') return -1;
  return null;
}

/** `null` se `data` não for exatamente `<prefixo><uuid>`. */
function lerUuid(prefixo: string, data: string | undefined): string | null {
  if (!data?.startsWith(prefixo)) return null;
  const resultado = uuid.safeParse(data.slice(prefixo.length));
  return resultado.success ? resultado.data : null;
}

/** `<prefixo><uuid>:<sufixo>`: devolve o uuid e o sufixo, ou `null`. */
function lerUuidESufixo(
  prefixo: string,
  data: string | undefined,
): { id: string; sufixo: string } | null {
  if (!data?.startsWith(prefixo)) return null;
  const [id, sufixo, ...resto] = data.slice(prefixo.length).split(':');
  if (resto.length > 0 || sufixo === undefined) return null;
  const resultado = uuid.safeParse(id);
  return resultado.success ? { id: resultado.data, sufixo } : null;
}

export const PREFIXO_FORMA = 'f:';
const FORMA_POR_SUFIXO = { c: 'credito', d: 'debito' } as const;

export function montarCallbackForma(
  pendenteId: string,
  valor: 'credito' | 'debito',
): string {
  return `${PREFIXO_FORMA}${pendenteId}:${valor === 'credito' ? 'c' : 'd'}`;
}

export function lerCallbackForma(
  data: string | undefined,
): { pendenteId: string; valor: 'credito' | 'debito' } | null {
  const lido = lerUuidESufixo(PREFIXO_FORMA, data);
  if (lido?.sufixo !== 'c' && lido?.sufixo !== 'd') return null;
  return { pendenteId: lido.id, valor: FORMA_POR_SUFIXO[lido.sufixo] };
}

export const PREFIXO_CARTAO = 'k:';
/** Um dígito: no máximo 10 cartões por pergunta. */
export const MAX_OPCOES_DE_CARTAO = 10;

export function montarCallbackCartao(
  pendenteId: string,
  indice: number,
): string {
  return `${PREFIXO_CARTAO}${pendenteId}:${indice}`;
}

export function lerCallbackCartao(
  data: string | undefined,
): { pendenteId: string; indice: number } | null {
  const lido = lerUuidESufixo(PREFIXO_CARTAO, data);
  if (!lido || !/^\d$/.test(lido.sufixo)) return null;
  return { pendenteId: lido.id, indice: Number(lido.sufixo) };
}

export const PREFIXO_CONFIRMAR_EDICAO = 'c:';
export const PREFIXO_CANCELAR_EDICAO = 'x:';
export const PREFIXO_PEDIR_REMOCAO = 'pr:';
export const PREFIXO_CONFIRMAR_REMOCAO = 'pc:';

export const montarCallbackConfirmarEdicao = (id: string): string =>
  `${PREFIXO_CONFIRMAR_EDICAO}${id}`;
export const lerCallbackConfirmarEdicao = (data: string | undefined) =>
  lerUuid(PREFIXO_CONFIRMAR_EDICAO, data);

export const montarCallbackCancelarEdicao = (id: string): string =>
  `${PREFIXO_CANCELAR_EDICAO}${id}`;
export const lerCallbackCancelarEdicao = (data: string | undefined) =>
  lerUuid(PREFIXO_CANCELAR_EDICAO, data);

export const montarCallbackPedirRemocao = (id: string): string =>
  `${PREFIXO_PEDIR_REMOCAO}${id}`;
export const lerCallbackPedirRemocao = (data: string | undefined) =>
  lerUuid(PREFIXO_PEDIR_REMOCAO, data);

export const montarCallbackConfirmarRemocao = (id: string): string =>
  `${PREFIXO_CONFIRMAR_REMOCAO}${id}`;
export const lerCallbackConfirmarRemocao = (data: string | undefined) =>
  lerUuid(PREFIXO_CONFIRMAR_REMOCAO, data);

/** Botão "manter" da confirmação de remoção: só fecha a pergunta. */
export const CALLBACK_MANTER_PARCELAMENTO = 'pn';

export const lerCallbackManterParcelamento = (
  data: string | undefined,
): boolean => data === CALLBACK_MANTER_PARCELAMENTO;
