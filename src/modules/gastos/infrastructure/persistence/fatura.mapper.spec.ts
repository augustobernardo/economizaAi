import { describe, expect, it } from 'vitest';
import { FaturaInformada } from '../../domain/fatura.js';
import { paraDominio, paraPersistencia } from './fatura.mapper.js';

describe('fatura.mapper', () => {
  it('preserva todos os campos na ida e volta', () => {
    const fatura = FaturaInformada.criar({
      cartaoId: crypto.randomUUID(),
      mes: '2026-11',
      valorInicialCentavos: 123_45,
      agora: new Date('2026-10-10T12:00:00Z'),
    });
    const linha = paraPersistencia(fatura);
    expect(linha.valorInicialCentavos).toBe(12_345);
    expect(paraDominio(linha)).toEqual(fatura);
  });
});
