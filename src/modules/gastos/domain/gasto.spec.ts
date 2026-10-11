import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../test/builders/gasto.builder.js';
import { Dinheiro } from './dinheiro.js';
import { Gasto, TETO_VALOR_CENTAVOS, type FormaPagamento } from './gasto.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  PagamentoInvalidoError,
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

describe('Gasto com pagamento', () => {
  it('guarda o pagamento no cartão', () => {
    const id = crypto.randomUUID();
    const g = umGasto().noCartao(id, 'credito').build();
    expect(g.pagamento).toEqual({ cartaoId: id, forma: 'credito' });
    expect(g.editadoEm).toBeNull();
  });

  it('sem cartão, pagamento é null', () => {
    expect(umGasto().build().pagamento).toBeNull();
  });

  it('recusa cartaoId vazio ou só espaços', () => {
    for (const id of ['', ' '])
      expect(() => umGasto().noCartao(id, 'credito').build()).toThrow(
        PagamentoInvalidoError,
      );
  });

  it('recusa forma desconhecida', () => {
    const forma = 'pix' as unknown as FormaPagamento;
    expect(() =>
      umGasto().noCartao(crypto.randomUUID(), forma).build(),
    ).toThrow(PagamentoInvalidoError);
  });

  it('restaurar preserva pagamento e editadoEm; sem eles, null', () => {
    const original = umGasto().build();
    const pagamento = {
      cartaoId: crypto.randomUUID(),
      forma: 'debito' as const,
    };
    const editadoEm = new Date('2026-06-16T10:00:00Z');
    const com = Gasto.restaurar({ ...original, pagamento, editadoEm });
    expect(com.pagamento).toEqual(pagamento);
    expect(com.editadoEm).toEqual(editadoEm);
    const sem = Gasto.restaurar({
      ...original,
      pagamento: undefined,
      editadoEm: undefined,
    });
    expect(sem.pagamento).toBeNull();
    expect(sem.editadoEm).toBeNull();
  });
});

describe('Gasto.editar', () => {
  const depois = new Date('2026-06-20T12:00:00Z');

  it('altera cada campo e preserva identidade e origem', () => {
    const original = umGasto().build();
    const novo = original.editar(
      {
        valor: Dinheiro.deReais(10),
        descricao: '  Padaria ',
        categoria: 'alimentacao',
        dataGasto: '2026-06-18',
        pagamento: { cartaoId: 'c1', forma: 'credito' },
      },
      depois,
    );

    expect(novo.valor.centavos).toBe(1000);
    expect(novo.descricao).toBe('Padaria');
    expect(novo.categoria).toBe('alimentacao');
    expect(novo.dataGasto).toBe('2026-06-18');
    expect(novo.pagamento).toEqual({ cartaoId: 'c1', forma: 'credito' });
    expect(novo.editadoEm).toBe(depois);
    expect(novo.id).toBe(original.id);
    expect(novo.registroId).toBe(original.registroId);
    expect(novo.origem).toBe(original.origem);
    expect(novo.textoOriginal).toBe(original.textoOriginal);
    expect(novo.criadoEm).toBe(original.criadoEm);
  });

  it('não muta o original', () => {
    const original = umGasto().build();
    const antes = original.descricao;
    original.editar({ descricao: 'Outra' }, depois);

    expect(original.descricao).toBe(antes);
    expect(original.editadoEm).toBeNull();
  });

  it('pagamento undefined mantém e null remove o cartão', () => {
    const pagamento = { cartaoId: 'c1', forma: 'debito' as FormaPagamento };
    const original = umGasto().build().editar({ pagamento }, depois);

    expect(original.editar({ descricao: 'x' }, depois).pagamento).toEqual(
      pagamento,
    );
    expect(original.editar({ pagamento: null }, depois).pagamento).toBeNull();
  });

  it('revalida descrição, data, teto e pagamento', () => {
    const g = umGasto().build();

    expect(() => g.editar({ descricao: ' ' }, depois)).toThrow(
      DescricaoVaziaError,
    );
    expect(() => g.editar({ dataGasto: '2026-13-40' }, depois)).toThrow(
      DataInvalidaError,
    );
    expect(() => g.editar({ dataGasto: '2026-06-21' }, depois)).toThrow(
      DataFuturaError,
    );
    expect(() => g.editar({ dataGasto: '2024-01-01' }, depois)).toThrow(
      DataForaDaJanelaError,
    );
    expect(() =>
      g.editar({ valor: Dinheiro.deReais(50_000.01) }, depois),
    ).toThrow(ValorAcimaDoTetoError);
    expect(() =>
      g.editar({ pagamento: { cartaoId: ' ', forma: 'credito' } }, depois),
    ).toThrow(PagamentoInvalidoError);
  });

  it('só valida a janela da data quando a data é alterada', () => {
    const antigo = Gasto.restaurar({
      id: 'x',
      valor: Dinheiro.deReais(10),
      categoria: 'outros',
      descricao: 'antigo',
      dataGasto: '2025-05-01',
      origem: 'texto',
      textoOriginal: 't',
      criadoEm: new Date('2025-05-01T00:00:00Z'),
      registroId: 'r',
    });

    expect(antigo.editar({ descricao: 'novo' }, depois).dataGasto).toBe(
      '2025-05-01',
    );
    expect(() => antigo.editar({ dataGasto: '2025-05-02' }, depois)).toThrow(
      DataForaDaJanelaError,
    );
  });
});
