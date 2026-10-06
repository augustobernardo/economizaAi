import { z } from 'zod';

export const PREFIXO_DESFAZER = 'd:';
const uuid = z.uuid();

export function montarCallbackDesfazer(registroId: string): string {
  return `${PREFIXO_DESFAZER}${registroId}`;
}

/** Devolve o registroId se o callback for válido; `null` para qualquer outra coisa. */
export function lerCallbackDesfazer(data: string | undefined): string | null {
  if (!data?.startsWith(PREFIXO_DESFAZER)) return null;
  const resultado = uuid.safeParse(data.slice(PREFIXO_DESFAZER.length));
  return resultado.success ? resultado.data : null;
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
