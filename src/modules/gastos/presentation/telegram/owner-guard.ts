export interface CtxOwnerGuard {
  from?: { id: number };
  update: object;
}

/**
 * Primeiro middleware do bot (SECURITY.md §3.2): só o dono passa. Estranhos não
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
    if (ctx.from?.id === ownerId) return next();
    const tipo = Object.keys(ctx.update)
      .filter((k) => k !== 'update_id')
      .join(',');
    logger.warn(
      `Update ignorado de from.id=${ctx.from?.id ?? 'desconhecido'} (tipo: ${tipo})`,
    );
  };
}
