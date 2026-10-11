import { describe, expect, it } from 'vitest';
import {
  CALLBACK_MANTER_PARCELAMENTO,
  lerCallbackCancelarEdicao,
  lerCallbackCartao,
  lerCallbackConfirmarEdicao,
  lerCallbackConfirmarRemocao,
  lerCallbackForma,
  lerCallbackManterParcelamento,
  lerCallbackPedirRemocao,
  montarCallbackCancelarEdicao,
  montarCallbackCartao,
  montarCallbackConfirmarEdicao,
  montarCallbackConfirmarRemocao,
  montarCallbackForma,
  montarCallbackPedirRemocao,
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

const ID = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
const LIXO = [undefined, '', 'x', ID, `d:${ID}`, '../../etc', 'f', 'k:', 'pc'];

describe('callback da forma de pagamento', () => {
  it('ida e volta, dentro de 64 bytes', () => {
    for (const valor of ['credito', 'debito'] as const) {
      const data = montarCallbackForma(ID, valor);
      expect(lerCallbackForma(data)).toEqual({ pendenteId: ID, valor });
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    }
    expect(montarCallbackForma(ID, 'credito')).toBe(`f:${ID}:c`);
  });

  it.each([
    ...LIXO,
    `f:${ID}`,
    `f:${ID}:x`,
    `f:${ID}:cc`,
    `f:nao-e-uuid:c`,
    `f:${ID}:c:extra`,
    `k:${ID}:c`,
  ])('%o → null', (data) => {
    expect(lerCallbackForma(data)).toBeNull();
  });
});

describe('callback do cartão (índice da opção)', () => {
  it('ida e volta, dentro de 64 bytes', () => {
    const data = montarCallbackCartao(ID, 9);
    expect(data).toBe(`k:${ID}:9`);
    expect(lerCallbackCartao(data)).toEqual({ pendenteId: ID, indice: 9 });
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
  });

  it.each([
    ...LIXO,
    `k:${ID}`,
    `k:${ID}:10`,
    `k:${ID}:-1`,
    `k:${ID}:a`,
    `k:${ID}:1.5`,
    `k:nao-e-uuid:1`,
    `f:${ID}:1`,
  ])('%o → null', (data) => {
    expect(lerCallbackCartao(data)).toBeNull();
  });
});

describe.each([
  [
    'confirmar edição',
    'c:',
    montarCallbackConfirmarEdicao,
    lerCallbackConfirmarEdicao,
  ],
  [
    'cancelar edição',
    'x:',
    montarCallbackCancelarEdicao,
    lerCallbackCancelarEdicao,
  ],
  [
    'pedir remoção de parcelamento',
    'pr:',
    montarCallbackPedirRemocao,
    lerCallbackPedirRemocao,
  ],
  [
    'confirmar remoção de parcelamento',
    'pc:',
    montarCallbackConfirmarRemocao,
    lerCallbackConfirmarRemocao,
  ],
] as const)('callback %s', (_, prefixo, montar, ler) => {
  it('ida e volta, dentro de 64 bytes', () => {
    expect(montar(ID)).toBe(`${prefixo}${ID}`);
    expect(ler(montar(ID))).toBe(ID);
    expect(Buffer.byteLength(montar(ID))).toBeLessThanOrEqual(64);
  });

  it.each([
    ...LIXO,
    prefixo,
    `${prefixo}nao-e-uuid`,
    `${prefixo}${ID}x`,
    `${prefixo}${ID}:1`,
    `${prefixo}../../etc`,
  ])('%o → null', (data) => {
    expect(ler(data)).toBeNull();
  });
});

describe('callback de manter o parcelamento', () => {
  it('só o valor exato', () => {
    expect(lerCallbackManterParcelamento(CALLBACK_MANTER_PARCELAMENTO)).toBe(
      true,
    );
    expect(
      lerCallbackManterParcelamento(`${CALLBACK_MANTER_PARCELAMENTO}x`),
    ).toBe(false);
    expect(lerCallbackManterParcelamento(undefined)).toBe(false);
  });
});
