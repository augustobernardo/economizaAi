import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import { resumir } from './resumo.js';

describe('resumir', () => {
  const gastos = [
    umGasto()
      .comValor(30)
      .comCategoria('alimentacao')
      .comDescricao('Almoço')
      .build(),
    umGasto()
      .comValor(50)
      .comCategoria('mercado')
      .comDescricao('Mercado')
      .build(),
    umGasto()
      .comValor(20)
      .comCategoria('alimentacao')
      .comDescricao('Lanche')
      .build(),
  ];

  it('total e quantidade', () => {
    const r = resumir(gastos);
    expect([r.quantidade, r.total.centavos]).toEqual([3, 10000]);
  });

  it('totais por categoria em ordem decrescente, com percentual', () => {
    expect(
      resumir(gastos).porCategoria.map((c) => [
        c.categoria,
        c.total.centavos,
        c.percentual,
      ]),
    ).toEqual([
      ['alimentacao', 5000, 50],
      ['mercado', 5000, 50],
    ]);
  });

  it('totais por categoria somam o total', () => {
    const r = resumir(gastos);
    expect(r.porCategoria.reduce((s, c) => s + c.total.centavos, 0)).toBe(
      r.total.centavos,
    );
  });

  it('percentual com uma casa decimal', () => {
    const r = resumir([
      umGasto().comValor(1).comCategoria('lazer').build(),
      umGasto().comValor(2).comCategoria('saude').build(),
    ]);
    expect(r.porCategoria.map((c) => c.percentual)).toEqual([66.7, 33.3]);
  });

  it('maior gasto', () => {
    expect(resumir(gastos).maiorGasto.descricao).toBe('Mercado');
  });

  it('lista vazia é erro de programação', () => {
    expect(() => resumir([])).toThrow();
  });
});
