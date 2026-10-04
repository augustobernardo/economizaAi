export interface CtxOwnerGuard {
  from?: { id: number };
  chat?: { type: string };
  update: object;
}

/**
 * Primeiro middleware do bot (SECURITY.md §3.2): só o dono, em chat privado, passa
 * (num grupo as respostas com gastos ficariam visíveis a todos). Estranhos não
 * recebem resposta (não confirma que o bot existe); o log tem `from.id` e o tipo
 * do update, nunca o conteúdo.
 */
export function criarOwnerGuard(
  ownerId: number,
  logger: { warn(mensagem: string): void },
) {
  return async (
    ctx: CtxOwnerGuard,
    next: () => Promise<void>,
  ): Promise<void> => {
    if (ctx.from?.id === ownerId && ctx.chat?.type === 'private') return next();
    const tipo = Object.keys(ctx.update)
      .filter((k) => k !== 'update_id')
      .join(',');
    logger.warn(
      `Update ignorado de from.id=${ctx.from?.id ?? 'desconhecido'} (tipo: ${tipo}, chat: ${ctx.chat?.type ?? 'desconhecido'})`,
    );
  };
}
