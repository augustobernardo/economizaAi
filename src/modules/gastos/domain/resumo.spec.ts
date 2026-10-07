import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import type { Categoria } from './categoria.js';
import type { Gasto } from './gasto.js';
import { plural, resumir } from './resumo.js';

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

  const de = (...pares: [number, Categoria][]) =>
    pares.map(([v, c]) => umGasto().comValor(v).comCategoria(c).build());
  const pcts = (lista: Gasto[]) =>
    resumir(lista).porCategoria.map((c) => [c.categoria, c.percentual]);

  it('três terços → 34/33/33, o resto vai para a primeira na ordem', () => {
    expect(pcts(de([1, 'lazer'], [1, 'mercado'], [1, 'saude']))).toEqual([
      ['lazer', 34],
      ['mercado', 33],
      ['saude', 33],
    ]);
  });

  it('2/3 + 1/3 → 67/33', () => {
    expect(pcts(de([2, 'saude'], [1, 'lazer']))).toEqual([
      ['saude', 67],
      ['lazer', 33],
    ]);
  });

  it('uma categoria → 100', () => {
    expect(pcts(de([7.77, 'outros']))).toEqual([['outros', 100]]);
  });

  it('categoria ínfima aparece com 0% e a soma segue 100', () => {
    expect(pcts(de([999.99, 'moradia'], [0.01, 'lazer']))).toEqual([
      ['moradia', 100],
      ['lazer', 0],
    ]);
  });

  it.each([
    [[10, 20, 30, 40.01]],
    [[0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]],
    [[33.33, 33.33, 33.34]],
  ])('soma sempre 100 (%j)', (valores) => {
    const cats: Categoria[] = [
      'lazer',
      'mercado',
      'saude',
      'moradia',
      'outros',
      'educacao',
      'transporte',
    ];
    const r = resumir(
      valores.map((v, i) =>
        umGasto()
          .comValor(v)
          .comCategoria(cats[i] as Categoria)
          .build(),
      ),
    );
    expect(r.porCategoria.reduce((s, c) => s + c.percentual, 0)).toBe(100);
  });

  it('soma em centavos sem erro de float (0,10 + 0,20)', () => {
    expect(resumir(de([0.1, 'lazer'], [0.2, 'lazer'])).total.centavos).toBe(30);
  });

  it('maior gasto', () => {
    expect(resumir(gastos).maiorGasto.descricao).toBe('Mercado');
  });

  it('lista vazia é erro de programação', () => {
    expect(() => resumir([])).toThrow();
  });
});

describe('plural', () => {
  it('usa o singular só para 1', () => {
    expect(plural(1, 'gasto', 'gastos')).toBe('1 gasto');
    expect(plural(0, 'gasto', 'gastos')).toBe('0 gastos');
    expect(plural(12, 'gasto', 'gastos')).toBe('12 gastos');
  });
});
