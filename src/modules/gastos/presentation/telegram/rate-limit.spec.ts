import { describe, expect, it, vi } from 'vitest';
import { MENSAGEM_RATE_LIMIT } from './formatador.js';
import { criarRateLimit } from './rate-limit.js';

function montar() {
  let agora = 0;
  const limite = criarRateLimit({
    limite: 20,
    janelaMs: 60_000,
    agora: () => agora,
  });
  const ctx = { from: { id: 1 }, reply: vi.fn(async () => undefined) };
  const next = vi.fn(async () => {});
  return { limite, ctx, next, avancar: (ms: number) => (agora += ms) };
}

describe('rate limit', () => {
  it('20 passam; o 21º avisa uma vez; o 22º é silencioso', async () => {
    const { limite, ctx, next } = montar();
    for (let i = 0; i < 22; i++) await limite(ctx, next);
    expect(next).toHaveBeenCalledTimes(20);
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_RATE_LIMIT);
  });

  it('callback barrado sempre responde o callback', async () => {
    const { limite, ctx, next } = montar();
    const answerCallbackQuery = vi.fn(async () => undefined);
    const cb = { ...ctx, callbackQuery: {}, answerCallbackQuery };
    for (let i = 0; i < 23; i++) await limite(cb, next);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(3);
    expect(answerCallbackQuery).toHaveBeenCalledWith(MENSAGEM_RATE_LIMIT);
    expect(ctx.reply).toHaveBeenCalledOnce();
  });

  it('nova janela libera de novo', async () => {
    const { limite, ctx, next, avancar } = montar();
    for (let i = 0; i < 21; i++) await limite(ctx, next);
    avancar(60_000);
    await limite(ctx, next);
    expect(next).toHaveBeenCalledTimes(21);
  });

  it('contagem é por from.id', async () => {
    const { limite, ctx, next } = montar();
    for (let i = 0; i < 20; i++) await limite(ctx, next);
    await limite({ ...ctx, from: { id: 2 } }, next);
    expect(next).toHaveBeenCalledTimes(21);
  });
});
