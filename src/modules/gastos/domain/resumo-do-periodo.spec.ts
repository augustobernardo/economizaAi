import { describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../test/builders/entrada.builder.js';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import { umParcelamento } from '../../../../test/builders/parcelamento.builder.js';
import { resumirPeriodo } from './resumo-do-periodo.js';

const vazio = {
  meses: ['2026-10'],
  gastos: [],
  entradas: [],
  parcelamentos: [],
  faturas: [],
};

describe('resumirPeriodo', () => {
  it('só gastos: saldo negativo e sem entradas', () => {
    const r = resumirPeriodo({
      ...vazio,
      gastos: [umGasto().comValor(30).build(), umGasto().comValor(20).build()],
    });
    expect(r?.compras?.total.centavos).toBe(5000);
    expect(r?.saldoCentavos).toBe(-5000);
    expect(r?.entradas.quantidade).toBe(0);
  });

  it('soma entradas, compras e parcelas sem misturar parcelas nas categorias', () => {
    const r = resumirPeriodo({
      ...vazio,
      entradas: [umaEntrada().comValor(4200).comCategoria('salario').build()],
      gastos: [umGasto().comValor(1080).comCategoria('mercado').build()],
      parcelamentos: [
        umParcelamento().comDescricao('Monitor').deParcela(10_000).build(),
        umParcelamento().comDescricao('Celular').deParcela(15_000).build(),
      ],
    });
    expect(r?.totalGastosCentavos).toBe(133_000);
    expect(r?.saldoCentavos).toBe(287_000);
    expect(r?.parcelas.itens).toHaveLength(2);
    expect(r?.parcelas.totalCentavos).toBe(25_000);
    expect(r?.compras?.porCategoria.map((c) => c.categoria)).toEqual([
      'mercado',
    ]);
    expect(r?.entradas.porCategoria).toEqual([
      { categoria: 'salario', totalCentavos: 420_000 },
    ]);
  });

  it('ignora parcelamento fora do período', () => {
    const r = resumirPeriodo({
      ...vazio,
      gastos: [umGasto().build()],
      parcelamentos: [umParcelamento().build()],
      meses: ['2027-12'],
    });
    expect(r?.parcelas.itens).toEqual([]);
  });

  it('tudo vazio devolve null', () => {
    expect(resumirPeriodo(vazio)).toBeNull();
  });

  it('período de 2 meses conta a parcela de cada mês', () => {
    const p = umParcelamento().deParcela(10_000).em(10).build();
    const r = resumirPeriodo({
      ...vazio,
      meses: ['2026-10', '2026-11'],
      parcelamentos: [p],
    });
    expect(r?.parcelas.itens.map((i) => i.numero)).toEqual([2, 1]);
    expect(r?.parcelas.totalCentavos).toBe(20_000);
    expect(r?.parcelas.itens[0]).toMatchObject({
      restantes: 8,
      terminaEm: '2027-07',
    });
  });

  it('ordena parcelas por restantes e depois descrição', () => {
    const a = umParcelamento().comDescricao('Zeta').em(3).build();
    const b = umParcelamento().comDescricao('Alfa').em(10).build();
    const c = umParcelamento().comDescricao('Beta').em(3).build();
    const r = resumirPeriodo({ ...vazio, parcelamentos: [a, b, c] });
    expect(r?.parcelas.itens.map((i) => i.parcelamento.descricao)).toEqual([
      'Beta',
      'Zeta',
      'Alfa',
    ]);
  });

  it('só fatura já basta para não ser null', () => {
    const r = resumirPeriodo({
      ...vazio,
      faturas: [
        {
          cartaoNome: 'Nubank',
          composicao: {
            cartaoId: crypto.randomUUID(),
            mes: '2026-10',
            vencimento: '2026-10-10',
            inicialCentavos: 0,
            compras: { quantidade: 0, centavos: 0 },
            parcelas: [],
            parcelasCentavos: 0,
            reembolsosCentavos: 0,
            totalCentavos: 0,
            creditoExcedenteCentavos: 0,
          },
        },
      ],
    });
    expect(r?.faturas).toHaveLength(1);
  });

  it('desempata por número quando restantes e descrição empatam', () => {
    const quatroDeDoze = umParcelamento()
      .comDescricao('Mesmo')
      .em(12)
      .aPartirDa(4, '2026-10', '2026-11')
      .build();
    const doisDeDez = umParcelamento()
      .comDescricao('Mesmo')
      .em(10)
      .aPartirDa(2, '2026-10', '2026-11')
      .build();
    const r = resumirPeriodo({
      ...vazio,
      parcelamentos: [quatroDeDoze, doisDeDez],
    });
    expect(r?.parcelas.itens.map((i) => i.numero)).toEqual([2, 4]);
  });

  it('inicial da fatura não altera o saldo', () => {
    const r = resumirPeriodo({
      ...vazio,
      entradas: [umaEntrada().comValor(100).build()],
      faturas: [
        {
          cartaoNome: 'Nubank',
          composicao: {
            cartaoId: crypto.randomUUID(),
            mes: '2026-10',
            vencimento: '2026-10-10',
            inicialCentavos: 90_000,
            compras: { quantidade: 0, centavos: 0 },
            parcelas: [],
            parcelasCentavos: 0,
            reembolsosCentavos: 0,
            totalCentavos: 90_000,
            creditoExcedenteCentavos: 0,
          },
        },
      ],
    });
    expect(r?.saldoCentavos).toBe(10_000);
  });

  it('meses duplicados não contam a parcela em dobro', () => {
    const p = umParcelamento().deParcela(10_000).build();
    const r = resumirPeriodo({
      ...vazio,
      meses: ['2026-10', '2026-10'],
      parcelamentos: [p],
    });
    expect(r?.parcelas.totalCentavos).toBe(10_000);
  });
});
