import { describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../test/builders/entrada.builder.js';
import { Dinheiro } from './dinheiro.js';
import { Entrada } from './entrada.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DescricaoVaziaError,
  RegistroIdVazioError,
  ValorAcimaDoTetoError,
  VinculoDeFaturaInvalidoError,
} from './errors.js';

describe('Entrada.criar', () => {
  it('cria com as mesmas invariantes do gasto', () => {
    const e = umaEntrada().comValor(4200).comCategoria('salario').build();
    expect(e.valor.centavos).toBe(420_000);
    expect(e.vinculo).toBeNull();
    expect(e.editadoEm).toBeNull();
    expect(e.criadoEm).toEqual(new Date('2026-10-10T12:00:00Z'));
  });

  it('recusa data futura, descrição vazia e teto', () => {
    expect(() => umaEntrada().comData('2026-10-11').build()).toThrow(
      DataFuturaError,
    );
    expect(() => umaEntrada().comDescricao(' ').build()).toThrow(
      DescricaoVaziaError,
    );
    expect(() => umaEntrada().comValor(50_000.01).build()).toThrow(
      ValorAcimaDoTetoError,
    );
  });

  it('aceita valor exatamente no teto', () => {
    expect(umaEntrada().comValor(50_000).build().valor.centavos).toBe(
      5_000_000,
    );
  });

  it('recusa registroId vazio', () => {
    expect(() => umaEntrada().doRegistro(' ').build()).toThrow(
      RegistroIdVazioError,
    );
  });

  it('vínculo de fatura só em reembolso', () => {
    const vinculo = { cartaoId: crypto.randomUUID(), mesFatura: '2026-11' };
    expect(
      umaEntrada().comCategoria('reembolso').vinculadaA(vinculo).build()
        .vinculo,
    ).toEqual(vinculo);
    expect(() =>
      umaEntrada().comCategoria('salario').vinculadaA(vinculo).build(),
    ).toThrow(VinculoDeFaturaInvalidoError);
    expect(() =>
      umaEntrada()
        .comCategoria('reembolso')
        .vinculadaA({ ...vinculo, mesFatura: '2026-13' })
        .build(),
    ).toThrow(VinculoDeFaturaInvalidoError);
    expect(() =>
      umaEntrada()
        .comCategoria('reembolso')
        .vinculadaA({ ...vinculo, cartaoId: ' ' })
        .build(),
    ).toThrow(VinculoDeFaturaInvalidoError);
  });
});

describe('Entrada.restaurar', () => {
  it('reidrata sem revalidar a janela de data', () => {
    const e = Entrada.restaurar({
      id: 'x',
      valor: Dinheiro.deReais(10),
      categoria: 'outros',
      descricao: 'antiga',
      dataEntrada: '2020-01-01',
      origem: 'texto',
      textoOriginal: 't',
      registroId: 'r',
      criadoEm: new Date('2020-01-01T00:00:00Z'),
    });
    expect(e.dataEntrada).toBe('2020-01-01');
    expect(e.vinculo).toBeNull();
    expect(e.editadoEm).toBeNull();
  });
});

describe('Entrada.editar', () => {
  const depois = new Date('2026-10-12T12:00:00Z');
  const vinculo = { cartaoId: 'c1', mesFatura: '2026-11' };

  it('altera cada campo e preserva identidade', () => {
    const original = umaEntrada().build();
    const nova = original.editar(
      {
        valor: Dinheiro.deReais(7),
        descricao: ' Bônus ',
        categoria: 'salario',
        dataEntrada: '2026-10-11',
      },
      depois,
    );

    expect(nova.valor.centavos).toBe(700);
    expect(nova.descricao).toBe('Bônus');
    expect(nova.categoria).toBe('salario');
    expect(nova.dataEntrada).toBe('2026-10-11');
    expect(nova.editadoEm).toBe(depois);
    expect(nova.id).toBe(original.id);
    expect(nova.registroId).toBe(original.registroId);
    expect(nova.criadoEm).toBe(original.criadoEm);
    expect(original.editadoEm).toBeNull();
  });

  it('vínculo undefined mantém e null remove', () => {
    const e = umaEntrada()
      .comCategoria('reembolso')
      .vinculadaA(vinculo)
      .build();

    expect(e.editar({ descricao: 'x' }, depois).vinculo).toEqual(vinculo);
    expect(e.editar({ vinculo: null }, depois).vinculo).toBeNull();
  });

  it('revalida invariantes e vínculo', () => {
    const e = umaEntrada()
      .comCategoria('reembolso')
      .vinculadaA(vinculo)
      .build();

    expect(() => e.editar({ descricao: ' ' }, depois)).toThrow(
      DescricaoVaziaError,
    );
    expect(() => e.editar({ dataEntrada: '2026-10-13' }, depois)).toThrow(
      DataFuturaError,
    );
    expect(() =>
      e.editar({ valor: Dinheiro.deReais(50_000.01) }, depois),
    ).toThrow(ValorAcimaDoTetoError);
    expect(() => e.editar({ categoria: 'salario' }, depois)).toThrow(
      VinculoDeFaturaInvalidoError,
    );
    expect(() =>
      e.editar({ vinculo: { ...vinculo, mesFatura: '2026-13' } }, depois),
    ).toThrow(VinculoDeFaturaInvalidoError);
  });

  it('troca categoria removendo o vínculo e mantém vínculo com reembolso explícito', () => {
    const e = umaEntrada()
      .comCategoria('reembolso')
      .vinculadaA(vinculo)
      .build();

    const semVinculo = e.editar(
      { categoria: 'salario', vinculo: null },
      depois,
    );
    expect(semVinculo.categoria).toBe('salario');
    expect(semVinculo.vinculo).toBeNull();
    expect(e.editar({ categoria: 'reembolso' }, depois).vinculo).toEqual(
      vinculo,
    );
  });

  it('só valida a janela da data quando a data é alterada', () => {
    const antiga = Entrada.restaurar({
      id: 'x',
      valor: Dinheiro.deReais(10),
      categoria: 'outros',
      descricao: 'antiga',
      dataEntrada: '2025-05-01',
      origem: 'texto',
      textoOriginal: 't',
      registroId: 'r',
      criadoEm: new Date('2025-05-01T00:00:00Z'),
    });

    expect(antiga.editar({ descricao: 'nova' }, depois).dataEntrada).toBe(
      '2025-05-01',
    );
    expect(() => antiga.editar({ dataEntrada: '2025-05-02' }, depois)).toThrow(
      DataForaDaJanelaError,
    );
  });
});
