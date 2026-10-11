import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import { Dinheiro } from './dinheiro.js';
import { comporFatura, FaturaInformada } from './fatura.js';
import {
  MesInvalidoError,
  PagamentoInvalidoError,
  ValorInicialInvalidoError,
} from './errors.js';

const agora = new Date('2026-10-10T12:00:00Z');
const cartaoId = crypto.randomUUID();

describe('FaturaInformada', () => {
  it('aceita zero e valores até o teto', () => {
    expect(
      FaturaInformada.criar({
        cartaoId,
        mes: '2026-11',
        valorInicialCentavos: 0,
        agora,
      }).valorInicial,
    ).toBe(0);
  });

  it('recusa negativo, não inteiro e acima do teto', () => {
    for (const v of [-1, 1.5, 5_000_001]) {
      expect(() =>
        FaturaInformada.criar({
          cartaoId,
          mes: '2026-11',
          valorInicialCentavos: v,
          agora,
        }),
      ).toThrow(ValorInicialInvalidoError);
    }
  });

  it('aceita exatamente o teto', () => {
    expect(
      FaturaInformada.criar({
        cartaoId,
        mes: '2026-11',
        valorInicialCentavos: 5_000_000,
        agora,
      }).valorInicial,
    ).toBe(5_000_000);
  });

  it('recusa NaN', () => {
    expect(() =>
      FaturaInformada.criar({
        cartaoId,
        mes: '2026-11',
        valorInicialCentavos: NaN,
        agora,
      }),
    ).toThrow(ValorInicialInvalidoError);
  });

  it('recusa cartaoId vazio', () => {
    for (const id of ['', ' '])
      expect(() =>
        FaturaInformada.criar({
          cartaoId: id,
          mes: '2026-11',
          valorInicialCentavos: 1,
          agora,
        }),
      ).toThrow(PagamentoInvalidoError);
  });

  it('restaurar preserva os campos', () => {
    const r = FaturaInformada.restaurar({
      cartaoId,
      mes: '2026-11',
      valorInicial: 7,
      informadaEm: agora,
    });
    expect(r).toMatchObject({
      cartaoId,
      mes: '2026-11',
      valorInicial: 7,
      informadaEm: agora,
    });
  });

  it('recusa mês inválido', () => {
    expect(() =>
      FaturaInformada.criar({
        cartaoId,
        mes: '2026-13',
        valorInicialCentavos: 1,
        agora,
      }),
    ).toThrow(MesInvalidoError);
  });
});

describe('comporFatura', () => {
  const compra30 = umGasto()
    .comValor(30)
    .noCartao(cartaoId, 'credito')
    .em(agora)
    .comData('2026-10-10')
    .build();

  it('400 informado + 30 no crédito = 430', () => {
    const f = comporFatura({
      cartaoId,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 40_000,
      comprasCredito: [compra30],
      parcelas: [],
      reembolsos: [],
    });
    expect(f.totalCentavos).toBe(43_000);
    expect(f.compras).toEqual({ quantidade: 1, centavos: 3_000 });
    expect(f.creditoExcedenteCentavos).toBe(0);
  });

  it('ignora compras no crédito de outro cartão', () => {
    const outro = umGasto()
      .comValor(99)
      .noCartao(crypto.randomUUID(), 'credito')
      .build();
    const f = comporFatura({
      cartaoId,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 0,
      comprasCredito: [compra30, outro],
      parcelas: [],
      reembolsos: [],
    });
    expect(f.cartaoId).toBe(cartaoId);
    expect(f.compras).toEqual({ quantidade: 1, centavos: 3_000 });
  });

  it('ignora compras no débito e sem cartão', () => {
    const debito = umGasto().comValor(20).noCartao(cartaoId, 'debito').build();
    const semCartao = umGasto().comValor(10).build();
    const f = comporFatura({
      cartaoId,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 0,
      comprasCredito: [compra30, debito, semCartao],
      parcelas: [],
      reembolsos: [],
    });
    expect(f.compras).toEqual({ quantidade: 1, centavos: 3_000 });
    expect(f.totalCentavos).toBe(3_000);
  });

  it('soma parcelas e desconta reembolsos', () => {
    const f = comporFatura({
      cartaoId,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 40_000,
      comprasCredito: [compra30],
      parcelas: [
        {
          descricao: 'Monitor',
          numero: 1,
          quantidade: 10,
          valor: Dinheiro.deCentavos(10_000),
        },
      ],
      reembolsos: [Dinheiro.deCentavos(3_850)],
    });
    expect(f.parcelasCentavos).toBe(10_000);
    expect(f.reembolsosCentavos).toBe(3_850);
    expect(f.totalCentavos).toBe(49_150);
  });

  it('reembolso maior que tudo: total 0 e crédito excedente', () => {
    const f = comporFatura({
      cartaoId,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 0,
      comprasCredito: [],
      parcelas: [],
      reembolsos: [Dinheiro.deCentavos(500)],
    });
    expect(f.totalCentavos).toBe(0);
    expect(f.creditoExcedenteCentavos).toBe(500);
  });
});
