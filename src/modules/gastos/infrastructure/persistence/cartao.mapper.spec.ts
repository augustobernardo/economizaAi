import { describe, expect, it } from 'vitest';
import { Cartao } from '../../domain/cartao.js';
import { paraDominio, paraPersistencia } from './cartao.mapper.js';

describe('cartao.mapper', () => {
  it('preserva todos os campos na ida e volta', () => {
    const cartao = Cartao.criar({
      nome: 'Nubank Roxinho',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: new Date('2026-10-10T12:00:00Z'),
    });
    const linha = paraPersistencia(cartao);
    expect(linha.nomeNormalizado).toBe('nubank roxinho');
    expect(paraDominio(linha)).toEqual(cartao);
  });
});
