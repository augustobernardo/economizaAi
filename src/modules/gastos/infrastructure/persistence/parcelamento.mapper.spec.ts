import { describe, expect, it } from 'vitest';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import { paraDominio, paraPersistencia } from './parcelamento.mapper.js';

describe('parcelamento.mapper', () => {
  it('preserva todos os campos na ida e volta', () => {
    const p = umParcelamento()
      .deTotal(100_01)
      .em(3)
      .aPartirDa(2, '2026-10', '2026-11')
      .build();
    const linha = paraPersistencia(p);
    expect(linha.primeiraParcelaCentavos).toBe(p.primeiraParcela.centavos);
    expect(paraDominio(linha)).toEqual(p);
  });
});
