import { describe, expect, it } from 'vitest';
import {
  lerCallbackDesfazer,
  lerCallbackExportar,
  montarCallbackDesfazer,
  montarCallbackExportar,
} from './callback.js';

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

describe('callback do Exportar', () => {
  it('monta', () => {
    expect(montarCallbackExportar(0)).toBe('e:0');
    expect(montarCallbackExportar(-1)).toBe('e:-1');
  });

  it('lê', () => {
    expect(lerCallbackExportar('e:0')).toBe(0);
    expect(lerCallbackExportar('e:-1')).toBe(-1);
  });

  it.each([undefined, 'e:', 'e:1', 'e:-2', 'e:abc', 'd:0', 'e:0x'])(
    '%o → null',
    (data) => {
      expect(lerCallbackExportar(data)).toBeNull();
    },
  );
});
