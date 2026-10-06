export interface CtxRateLimit {
  from?: { id: number };
  callbackQuery?: unknown;
  reply(texto: string): Promise<unknown>;
  answerCallbackQuery?(texto?: string): Promise<unknown>;
}

export const MENSAGEM_RATE_LIMIT =
  'Muitas mensagens seguidas, espere um minuto.';

/** Janela fixa por `from.id` (SECURITY.md §3.2: proteção contra loop e cota). */
export function criarRateLimit(opcoes: {
  limite: number;
  janelaMs: number;
  agora?: () => number;
}) {
  const agora = opcoes.agora ?? Date.now;
  // ponytail: estado em memória, zera a cada restart; ok para um único usuário.
  const janelas = new Map<number, { inicio: number; contagem: number }>();

  return async (
    ctx: CtxRateLimit,
    next: () => Promise<void>,
  ): Promise<void> => {
    const id = ctx.from?.id;
    if (id === undefined) return next();
    const instante = agora();
    let janela = janelas.get(id);
    if (!janela || instante - janela.inicio >= opcoes.janelaMs) {
      janela = { inicio: instante, contagem: 0 };
      janelas.set(id, janela);
    }
    janela.contagem++;
    if (janela.contagem <= opcoes.limite) return next();
    // Sem isto o spinner do botão fica girando em cada clique barrado.
    if (ctx.callbackQuery) await ctx.answerCallbackQuery?.(MENSAGEM_RATE_LIMIT);
    if (janela.contagem === opcoes.limite + 1)
      await ctx.reply(MENSAGEM_RATE_LIMIT);
  };
}
