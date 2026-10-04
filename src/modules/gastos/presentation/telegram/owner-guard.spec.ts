import { describe, expect, it, vi } from 'vitest';
import { criarOwnerGuard } from './owner-guard.js';

const DONO = 42;

function montar() {
  const logger = { warn: vi.fn() };
  const next = vi.fn(async () => {});
  return { logger, next, guard: criarOwnerGuard(DONO, logger) };
}

describe('owner guard', () => {
  it('dono passa', async () => {
    const { guard, next, logger } = montar();
    await guard(
      { from: { id: DONO }, update: { update_id: 1, message: {} } },
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('estranho é bloqueado e logado sem conteúdo', async () => {
    const { guard, next, logger } = montar();
    await guard(
      {
        from: { id: 7 },
        update: { update_id: 1, message: { text: 'segredo' } },
      },
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    const log = logger.warn.mock.calls[0]![0] as string;
    expect(log).toContain('7');
    expect(log).toContain('message');
    expect(log).not.toContain('segredo');
  });

  it('update sem from é bloqueado', async () => {
    const { guard, next } = montar();
    await guard({ update: { update_id: 1, channel_post: {} } }, next);
    expect(next).not.toHaveBeenCalled();
  });
});
