import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { Gasto } from '../../domain/gasto.js';
import { paraDominio, paraPersistencia } from './gasto.mapper.js';

describe('gasto.mapper', () => {
  it('preserva todos os campos na ida e volta', () => {
    const gasto = umGasto().build();
    const volta = paraDominio(paraPersistencia(gasto));
    expect(volta).toEqual(gasto);
    expect(volta.valor.centavos).toBe(gasto.valor.centavos);
  });

  it('preserva registroId na ida e volta', () => {
    const gasto = umGasto().doRegistro(crypto.randomUUID()).build();
    const linha = paraPersistencia(gasto);
    expect(linha.registroId).toBe(gasto.registroId);
    expect(paraDominio(linha).registroId).toBe(gasto.registroId);
  });

  it('gera valorCentavos inteiro', () => {
    const linha = paraPersistencia(umGasto().comValor(50).build());
    expect(linha.valorCentavos).toBe(5000);
  });

  it('preserva pagamento e editadoEm', () => {
    const base = umGasto().noCartao(crypto.randomUUID(), 'credito').build();
    const gasto = Gasto.restaurar({
      ...base,
      editadoEm: new Date('2026-06-16T08:00:00Z'),
    });
    const linha = paraPersistencia(gasto);
    expect(linha.cartaoId).toBe(base.pagamento?.cartaoId);
    expect(linha.formaPagamento).toBe('credito');
    expect(paraDominio(linha)).toEqual(gasto);
  });

  it('sem pagamento grava nulos', () => {
    const linha = paraPersistencia(umGasto().build());
    expect(linha.cartaoId).toBeNull();
    expect(linha.formaPagamento).toBeNull();
    expect(linha.editadoEm).toBeNull();
  });
});
