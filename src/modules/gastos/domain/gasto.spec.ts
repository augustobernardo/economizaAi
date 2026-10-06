import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import { Dinheiro } from './dinheiro.js';
import { Gasto, TETO_VALOR_CENTAVOS } from './gasto.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  RegistroIdVazioError,
  ValorAcimaDoTetoError,
} from './errors.js';

describe('Gasto.criar', () => {
  it('cria com valor, categoria, descrição, dataGasto, origem e textoOriginal', () => {
    const agora = new Date('2026-06-15T12:00:00Z');
    const gasto = Gasto.criar({
      valor: Dinheiro.deReais(32.5),
      categoria: 'transporte',
      descricao: 'Uber',
      dataGasto: '2026-06-15',
      origem: 'texto',
      textoOriginal: 'ontem gastei 32,50 de uber',
      agora,
      registroId: crypto.randomUUID(),
    });

    expect(gasto.id).toBeTruthy();
    expect(gasto.valor.centavos).toBe(3250);
    expect(gasto.categoria).toBe('transporte');
    expect(gasto.descricao).toBe('Uber');
    expect(gasto.dataGasto).toBe('2026-06-15');
    expect(gasto.origem).toBe('texto');
    expect(gasto.textoOriginal).toBe('ontem gastei 32,50 de uber');
    expect(gasto.criadoEm).toBe(agora);
  });

  it('gera ids diferentes para gastos diferentes', () => {
    const g1 = umGasto().build();
    const g2 = umGasto().build();

    expect(g1.id).not.toBe(g2.id);
  });

  it('remove espaços nas bordas da descrição', () => {
    const gasto = umGasto().comDescricao('  Uber  ').build();

    expect(gasto.descricao).toBe('Uber');
  });

  it.each(['', '   '])(
    'rejeita descrição vazia ou só com espaços (%j)',
    (descricao) => {
      expect(() => umGasto().comDescricao(descricao).build()).toThrow(
        DescricaoVaziaError,
      );
    },
  );

  it.each(['03/10/2026', '2026/10/03', 'ontem', '2026-13-01'])(
    'rejeita dataGasto fora do formato YYYY-MM-DD (%s)',
    (dataGasto) => {
      expect(() => umGasto().comData(dataGasto).build()).toThrow(
        DataInvalidaError,
      );
    },
  );

  it('rejeita dataGasto com dia que não existe no calendário', () => {
    expect(() => umGasto().comData('2026-02-30').build()).toThrow(
      DataInvalidaError,
    );
  });

  it('aceita dataGasto igual a hoje em America/Sao_Paulo', () => {
    // 2026-10-04T02:30:00Z ainda é 03/10 às 23:30 em São Paulo (UTC-3).
    const agora = new Date('2026-10-04T02:30:00Z');

    expect(() =>
      umGasto().comData('2026-10-03').em(agora).build(),
    ).not.toThrow();
  });

  it('rejeita dataGasto no futuro em America/Sao_Paulo', () => {
    const agora = new Date('2026-10-04T02:30:00Z');

    expect(() => umGasto().comData('2026-10-04').em(agora).build()).toThrow(
      DataFuturaError,
    );
  });

  it('aceita dataGasto exatamente 1 ano atrás', () => {
    const agora = new Date('2026-10-03T12:00:00Z');

    expect(() =>
      umGasto().comData('2025-10-03').em(agora).build(),
    ).not.toThrow();
  });

  it('rejeita dataGasto um dia antes da janela de 1 ano', () => {
    const agora = new Date('2026-10-03T12:00:00Z');

    expect(() => umGasto().comData('2025-10-02').em(agora).build()).toThrow(
      DataForaDaJanelaError,
    );
  });

  it('aceita valor exatamente igual ao teto', () => {
    expect(() =>
      umGasto()
        .comValor(TETO_VALOR_CENTAVOS / 100)
        .build(),
    ).not.toThrow();
  });

  it('rejeita valor acima do teto', () => {
    expect(() =>
      umGasto()
        .comValor(TETO_VALOR_CENTAVOS / 100 + 0.01)
        .build(),
    ).toThrow(ValorAcimaDoTetoError);
  });
});

describe('Gasto.restaurar', () => {
  it('reidrata um gasto completo sem revalidar regras dependentes do tempo', () => {
    const gasto = Gasto.restaurar({
      id: 'id-existente',
      valor: Dinheiro.deReais(10),
      categoria: 'lazer',
      descricao: 'Cinema',
      dataGasto: '2000-01-01', // fora da janela de 1 ano, mas já estava persistido
      origem: 'texto',
      textoOriginal: 'cinema',
      criadoEm: new Date('2000-01-01T12:00:00Z'),
      registroId: 'reg-1',
    });

    expect(gasto.id).toBe('id-existente');
    expect(gasto.dataGasto).toBe('2000-01-01');
  });
});

describe('registroId', () => {
  it('guarda o registroId recebido', () => {
    const registroId = crypto.randomUUID();
    const gasto = umGasto().doRegistro(registroId).build();
    expect(gasto.registroId).toBe(registroId);
  });

  it('registroId vazio → RegistroIdVazioError', () => {
    expect(() => umGasto().doRegistro('  ').build()).toThrow(
      RegistroIdVazioError,
    );
  });

  it('restaurar preserva o registroId', () => {
    const original = umGasto().build();
    const restaurado = Gasto.restaurar({ ...original, valor: original.valor });
    expect(restaurado.registroId).toBe(original.registroId);
  });
});
