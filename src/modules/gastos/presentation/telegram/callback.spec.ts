import { describe, expect, it } from 'vitest';
import { lerCallbackDesfazer, montarCallbackDesfazer } from './callback.js';

describe('callback do Desfazer', () => {
  const id = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

  it('ida e volta', () => {
    expect(lerCallbackDesfazer(montarCallbackDesfazer(id))).toBe(id);
  });

  it('cabe no limite de 64 bytes do Telegram', () => {
    expect(Buffer.byteLength(montarCallbackDesfazer(id))).toBeLessThanOrEqual(
      64,
    );
  });

  it.each([
    undefined,
    '',
    'd:',
    'd:nao-e-uuid',
    `x:${id}`,
    id,
    `d:${id}x`,
    'd:../../etc',
  ])('%o → null', (data) => {
    expect(lerCallbackDesfazer(data)).toBeNull();
  });
});
