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
