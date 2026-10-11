import { describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { Entrada } from '../../domain/entrada.js';
import { paraDominio, paraPersistencia } from './entrada.mapper.js';

describe('entrada.mapper', () => {
  it('preserva todos os campos na ida e volta', () => {
    const e = umaEntrada().build();
    expect(paraDominio(paraPersistencia(e))).toEqual(e);
  });

  it('preserva o vínculo com a fatura', () => {
    const vinculo = { cartaoId: crypto.randomUUID(), mesFatura: '2026-11' };
    const e = umaEntrada()
      .comCategoria('reembolso')
      .vinculadaA(vinculo)
      .build();
    const linha = paraPersistencia(e);
    expect(linha.cartaoId).toBe(vinculo.cartaoId);
    expect(linha.mesFatura).toBe('2026-11');
    expect(paraDominio(linha).vinculo).toEqual(vinculo);
  });

  it('sem vínculo grava nulos', () => {
    const linha = paraPersistencia(umaEntrada().build());
    expect(linha.cartaoId).toBeNull();
    expect(linha.mesFatura).toBeNull();
  });

  it('preserva editadoEm', () => {
    const e = umaEntrada().build();
    const editada = Entrada.restaurar({
      ...e,
      editadoEm: new Date('2026-10-11T08:00:00Z'),
    });
    expect(paraDominio(paraPersistencia(editada)).editadoEm).toEqual(
      editada.editadoEm,
    );
  });
});
