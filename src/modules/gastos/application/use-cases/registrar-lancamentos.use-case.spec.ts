import { beforeEach, describe, expect, it } from 'vitest';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { PendenciasEmMemoria } from '../../infrastructure/pendencias-em-memoria.js';
import { Cartao } from '../../domain/cartao.js';
import {
  DataFuturaError,
  QuantidadeDeParcelasInvalidaError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import {
  CartaoNaoCadastradoError,
  EscolhaInvalidaError,
  NenhumCartaoCadastradoError,
  NenhumGastoEncontradoError,
  PendenciaExpiradaError,
} from '../errors.js';
import type {
  EntradaExtraida,
  GastoExtraido,
  Interpretacao,
  ParcelamentoExtraido,
} from '../ports/interpretador-de-mensagem.js';
import { ConcluirRegistroPendenteUseCase } from './concluir-registro-pendente.use-case.js';
import { DesfazerRegistroUseCase } from './desfazer-registro.use-case.js';
import {
  RegistrarLancamentosUseCase,
  type RegistroPendente,
  type ResultadoRegistro,
} from './registrar-lancamentos.use-case.js';

const AGORA = new Date('2026-10-10T15:00:00Z');
type Registrar = Extract<Interpretacao, { intencao: 'registrar' }>;

const gasto = (p: Partial<GastoExtraido> = {}): GastoExtraido => ({
  valorReais: 30,
  categoria: 'transporte',
  descricao: 'Uber',
  dataGasto: '2026-10-09',
  cartao: null,
  formaPagamento: null,
  ...p,
});
const entrada = (p: Partial<EntradaExtraida> = {}): EntradaExtraida => ({
  valorReais: 100,
  categoria: 'salario',
  descricao: 'Salário',
  dataEntrada: '2026-10-05',
  cartao: null,
  mesFatura: null,
  ...p,
});
const parcelamento = (
  p: Partial<ParcelamentoExtraido> = {},
): ParcelamentoExtraido => ({
  descricao: 'Monitor',
  categoria: 'outros',
  cartao: 'Inter',
  totalReais: 1000,
  valorParcelaReais: null,
  quantidade: 10,
  parcelaAtual: null,
  dataCompra: '2026-10-10',
  ...p,
});
const interpretacao = (p: Partial<Registrar> = {}): Registrar => ({
  intencao: 'registrar',
  gastos: [],
  entradas: [],
  parcelamentos: [],
  textoOriginal: 'texto',
  ...p,
});

describe('RegistrarLancamentosUseCase', () => {
  let mundo: Mundo;
  let pendencias: PendenciasEmMemoria<RegistroPendente>;
  let registrar: RegistrarLancamentosUseCase;
  let concluir: ConcluirRegistroPendenteUseCase;
  let inter: Cartao;
  let nubank: Cartao;

  beforeEach(async () => {
    mundo = criarMundoEmMemoria();
    const relogio = new RelogioFixo(AGORA);
    pendencias = new PendenciasEmMemoria(relogio);
    registrar = new RegistrarLancamentosUseCase(
      mundo.registro,
      mundo.cartoes,
      pendencias,
      relogio,
    );
    concluir = new ConcluirRegistroPendenteUseCase(registrar, pendencias);
    inter = Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    });
    nubank = Cartao.criar({
      nome: 'Nubank',
      diaFechamento: 25,
      diaVencimento: 5,
      agora: AGORA,
    });
  });

  const cadastrar = async (...cartoes: Cartao[]) => {
    for (const c of cartoes) await mundo.cartoes.salvar(c);
  };
  const executar = (i: Registrar, escolhas?: Record<string, string>) =>
    registrar.executar({ interpretacao: i, origem: 'texto', escolhas });
  const registrado = (r: ResultadoRegistro) => {
    if (r.tipo !== 'registrado') throw new Error('esperava registrado');
    return r;
  };
  const salvos = async () => {
    const c = await mundo.gastos.listarPorPeriodo('0000-01-01', '9999-12-31');
    return c.length;
  };

  it('criadoEm cresce estritamente na ordem de extração (gastos, entradas, parcelamentos)', async () => {
    await cadastrar(inter);
    const r = registrado(
      await executar(
        interpretacao({
          gastos: [gasto(), gasto()],
          entradas: [entrada()],
          parcelamentos: [parcelamento()],
        }),
      ),
    );

    const instantes = [...r.gastos, ...r.entradas, ...r.parcelamentos].map(
      (i) => i.criadoEm.getTime(),
    );
    expect(instantes).toEqual([0, 1, 2, 3].map((n) => AGORA.getTime() + n));
  });

  it('gasto sem cartão nem forma → sem pagamento', async () => {
    const r = registrado(await executar(interpretacao({ gastos: [gasto()] })));

    expect(r.gastos[0]?.pagamento).toBeNull();
    expect(r.gastos[0]?.valor.centavos).toBe(3000);
    expect(await salvos()).toBe(1);
  });

  it('lançamentos vazios → NenhumGastoEncontradoError com o texto', async () => {
    const erro = await executar(interpretacao({ textoOriginal: 'oi' })).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(NenhumGastoEncontradoError);
    expect((erro as NenhumGastoEncontradoError).textoOriginal).toBe('oi');
  });

  it('gasto no crédito do Inter → pagamento {Inter, credito}', async () => {
    await cadastrar(inter, nubank);

    const r = registrado(
      await executar(
        interpretacao({
          gastos: [gasto({ cartao: 'inter', formaPagamento: 'credito' })],
        }),
      ),
    );

    expect(r.gastos[0]?.pagamento).toEqual({
      cartaoId: inter.id,
      forma: 'credito',
    });
  });

  it('cartão citado e forma nula → escolha de forma; concluir registra', async () => {
    await cadastrar(inter);

    const r = await executar(
      interpretacao({ gastos: [gasto({ cartao: 'Inter' })] }),
    );

    expect(r).toMatchObject({
      tipo: 'escolha',
      escolha: { tipo: 'forma', indiceGasto: 0 },
      opcoes: [
        { rotulo: '💳 Crédito', valor: 'credito' },
        { rotulo: '🏦 Débito', valor: 'debito' },
      ],
    });
    expect(await salvos()).toBe(0);
    if (r.tipo !== 'escolha') return;

    const final = registrado(await concluir.executar(r.pendenteId, 'debito'));
    expect(final.gastos[0]?.pagamento).toEqual({
      cartaoId: inter.id,
      forma: 'debito',
    });
    expect(await salvos()).toBe(1);
  });

  it('forma sem cartão: 2 cartões → escolha de cartão, depois registra', async () => {
    await cadastrar(inter, nubank);

    const r = await executar(
      interpretacao({ gastos: [gasto({ formaPagamento: 'credito' })] }),
    );

    expect(r).toMatchObject({
      tipo: 'escolha',
      escolha: { tipo: 'cartao', alvo: 'gasto', indice: 0 },
      opcoes: [
        { rotulo: 'Inter', valor: inter.id },
        { rotulo: 'Nubank', valor: nubank.id },
      ],
    });
    if (r.tipo !== 'escolha') return;
    const final = registrado(await concluir.executar(r.pendenteId, nubank.id));
    expect(final.gastos[0]?.pagamento).toEqual({
      cartaoId: nubank.id,
      forma: 'credito',
    });
  });

  it('cartão escolhido pelo índice das opções guardadas na pendência', async () => {
    await cadastrar(inter, nubank);
    const r = await executar(
      interpretacao({ gastos: [gasto({ formaPagamento: 'credito' })] }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');
    // Um cartão novo depois da pergunta não desloca os índices oferecidos.
    await cadastrar(
      Cartao.criar({
        nome: 'C6',
        diaFechamento: 1,
        diaVencimento: 8,
        agora: AGORA,
      }),
    );

    const final = registrado(await concluir.executarPorIndice(r.pendenteId, 1));

    expect(final.gastos[0]?.pagamento?.cartaoId).toBe(nubank.id);
  });

  it('índice fora das opções → EscolhaInvalidaError e a pendência continua', async () => {
    await cadastrar(inter, nubank);
    const r = await executar(
      interpretacao({ gastos: [gasto({ formaPagamento: 'credito' })] }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');

    await expect(
      concluir.executarPorIndice(r.pendenteId, 2),
    ).rejects.toBeInstanceOf(EscolhaInvalidaError);
    registrado(await concluir.executarPorIndice(r.pendenteId, 0));
  });

  it('índice com pendência expirada → PendenciaExpiradaError', async () => {
    await expect(
      concluir.executarPorIndice('nao-existe', 0),
    ).rejects.toBeInstanceOf(PendenciaExpiradaError);
  });

  it('responder a forma gera nova escolha (cartão do gasto seguinte)', async () => {
    await cadastrar(inter, nubank);
    const r = await executar(
      interpretacao({
        gastos: [
          gasto({ cartao: 'Inter' }),
          gasto({ formaPagamento: 'debito' }),
        ],
      }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');

    const seguinte = await concluir.executar(r.pendenteId, 'credito');

    expect(seguinte).toMatchObject({
      tipo: 'escolha',
      escolha: { tipo: 'cartao', indice: 1 },
    });
  });

  it('forma sem cartão: 1 cartão → usa; 0 → NenhumCartaoCadastradoError', async () => {
    const i = interpretacao({ gastos: [gasto({ formaPagamento: 'credito' })] });
    await expect(executar(i)).rejects.toBeInstanceOf(
      NenhumCartaoCadastradoError,
    );

    await cadastrar(inter);
    const r = registrado(await executar(i));
    expect(r.gastos[0]?.pagamento).toEqual({
      cartaoId: inter.id,
      forma: 'credito',
    });
  });

  it('cartão não cadastrado → CartaoNaoCadastradoError e nada salvo', async () => {
    await cadastrar(inter);

    const erro = await executar(
      interpretacao({
        gastos: [gasto(), gasto({ cartao: 'C6', formaPagamento: 'credito' })],
      }),
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(CartaoNaoCadastradoError);
    expect((erro as CartaoNaoCadastradoError).nome).toBe('C6');
    expect(await salvos()).toBe(0);
  });

  it('valor de escolha inválido → EscolhaInvalidaError', async () => {
    await cadastrar(inter);
    const r = await executar(
      interpretacao({ gastos: [gasto({ cartao: 'Inter' })] }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');

    await expect(concluir.executar(r.pendenteId, 'pix')).rejects.toBeInstanceOf(
      EscolhaInvalidaError,
    );
    await expect(
      concluir.executar(r.pendenteId, 'credito'),
    ).rejects.toBeInstanceOf(PendenciaExpiradaError);
    expect(await salvos()).toBe(0);
  });

  it('mensagem mista válida → um registroId em todos', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({
          gastos: [gasto()],
          entradas: [entrada()],
          parcelamentos: [parcelamento()],
        }),
      ),
    );

    const ids = [r.gastos[0], r.entradas[0], r.parcelamentos[0]].map(
      (x) => x?.registroId,
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(r.registroId);
    expect(r.cartoes.get(inter.id)).toBe(inter);
  });

  it('mista com parcelamento de 60x → QuantidadeDeParcelasInvalidaError e nada salvo', async () => {
    await cadastrar(inter);

    await expect(
      executar(
        interpretacao({
          gastos: [gasto()],
          entradas: [entrada()],
          parcelamentos: [parcelamento({ quantidade: 60 })],
        }),
      ),
    ).rejects.toBeInstanceOf(QuantidadeDeParcelasInvalidaError);
    expect(await salvos()).toBe(0);
    expect(
      (await mundo.entradas.listarPorPeriodo('0000-01-01', '9999-12-31'))
        .length,
    ).toBe(0);
  });

  it('parcelamento novo comprado hoje no Inter → fatura 2026-11', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(interpretacao({ parcelamentos: [parcelamento()] })),
    );

    const p = r.parcelamentos[0];
    expect(p).toMatchObject({
      parcelaInicial: 1,
      mesCompetenciaInicial: '2026-10',
      mesFaturaInicial: '2026-11',
    });
    expect(p?.total.centavos).toBe(100_000);
  });

  it('parcelamento em andamento (parcela 3) → competência de hoje e próxima fatura', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({
          parcelamentos: [
            parcelamento({ parcelaAtual: 3, dataCompra: '2026-08-01' }),
          ],
        }),
      ),
    );

    expect(r.parcelamentos[0]).toMatchObject({
      parcelaInicial: 3,
      mesCompetenciaInicial: '2026-10',
      mesFaturaInicial: '2026-11',
    });
  });

  it('parcelamento sem cartão com 1 cartão cadastrado usa esse cartão', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({ parcelamentos: [parcelamento({ cartao: null })] }),
      ),
    );

    expect(r.parcelamentos[0]?.cartaoId).toBe(inter.id);
  });

  it('erro de validação vem antes de qualquer escolha, sem criar pendência', async () => {
    await cadastrar(inter, nubank);
    const antes = pendencias.guardar.bind(pendencias);
    let guardadas = 0;
    pendencias.guardar = (v) => {
      guardadas++;
      return antes(v);
    };

    await expect(
      executar(
        interpretacao({
          gastos: [
            gasto({ cartao: 'Inter' }),
            gasto({ cartao: 'C6', formaPagamento: 'credito' }),
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(CartaoNaoCadastradoError);
    await expect(
      executar(
        interpretacao({
          gastos: [gasto({ formaPagamento: 'credito' })],
          parcelamentos: [parcelamento({ quantidade: 60 })],
        }),
      ),
    ).rejects.toBeInstanceOf(QuantidadeDeParcelasInvalidaError);
    expect(guardadas).toBe(0);
  });

  it('parcelamento sem cartão: 0 → NenhumCartaoCadastradoError; 2 cartões → escolha', async () => {
    const i = interpretacao({
      parcelamentos: [parcelamento({ cartao: null })],
    });
    await expect(executar(i)).rejects.toBeInstanceOf(
      NenhumCartaoCadastradoError,
    );

    await cadastrar(inter, nubank);
    expect(await executar(i)).toMatchObject({
      tipo: 'escolha',
      escolha: { tipo: 'cartao', alvo: 'parcelamento', indice: 0 },
    });
  });

  it('reembolso citando Inter sem mês → vínculo na próxima fatura', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({
          entradas: [entrada({ categoria: 'reembolso', cartao: 'Inter' })],
        }),
      ),
    );

    expect(r.entradas[0]?.vinculo).toEqual({
      cartaoId: inter.id,
      mesFatura: '2026-11',
    });
  });

  it('reembolso com mês citado usa o mês', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({
          entradas: [
            entrada({
              categoria: 'reembolso',
              cartao: 'Inter',
              mesFatura: '2026-12',
            }),
          ],
        }),
      ),
    );

    expect(r.entradas[0]?.vinculo?.mesFatura).toBe('2026-12');
  });

  it('reembolso sem cartões cadastrados → entrada comum + aviso', async () => {
    const r = registrado(
      await executar(
        interpretacao({
          entradas: [entrada({ categoria: 'reembolso', cartao: 'Inter' })],
        }),
      ),
    );

    expect(r.entradas[0]?.vinculo).toBeNull();
    expect(r.avisos).toEqual(['reembolso-sem-cartao']);
  });

  it('dois reembolsos sem cartões cadastrados → um só aviso', async () => {
    const reembolso = entrada({ categoria: 'reembolso', cartao: 'Inter' });

    const r = registrado(
      await executar(interpretacao({ entradas: [reembolso, reembolso] })),
    );

    expect(r.avisos).toEqual(['reembolso-sem-cartao']);
  });

  it('reembolso sem cartão nem mês, ou categoria diferente → sem vínculo', async () => {
    await cadastrar(inter);

    const r = registrado(
      await executar(
        interpretacao({
          entradas: [
            entrada({ categoria: 'reembolso' }),
            entrada({ categoria: 'salario', cartao: 'Inter' }),
          ],
        }),
      ),
    );

    expect(r.entradas.map((e) => e.vinculo)).toEqual([null, null]);
    expect(r.avisos).toEqual([]);
  });

  it('reembolso com mês e sem cartão, 2 cartões → escolha de cartão da entrada', async () => {
    await cadastrar(inter, nubank);

    const r = await executar(
      interpretacao({
        entradas: [entrada({ categoria: 'reembolso', mesFatura: '2026-11' })],
      }),
    );

    expect(r).toMatchObject({
      tipo: 'escolha',
      escolha: { tipo: 'cartao', alvo: 'entrada', indice: 0 },
    });
  });

  it('pendência expirada ou inexistente → PendenciaExpiradaError', async () => {
    await expect(
      concluir.executar('nao-existe', 'credito'),
    ).rejects.toBeInstanceOf(PendenciaExpiradaError);
  });

  it('duplo clique simultâneo registra uma vez só', async () => {
    await cadastrar(inter);
    const r = await executar(
      interpretacao({ gastos: [gasto({ cartao: 'Inter' })] }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');

    const [a, b] = await Promise.allSettled([
      concluir.executar(r.pendenteId, 'credito'),
      concluir.executar(r.pendenteId, 'credito'),
    ]);

    expect(a.status).toBe('fulfilled');
    expect(b.status === 'rejected' && b.reason).toBeInstanceOf(
      PendenciaExpiradaError,
    );
    expect(await salvos()).toBe(1);
  });

  it('pendência concluída é descartada', async () => {
    await cadastrar(inter);
    const r = await executar(
      interpretacao({ gastos: [gasto({ cartao: 'Inter' })] }),
    );
    if (r.tipo !== 'escolha') throw new Error('esperava escolha');
    await concluir.executar(r.pendenteId, 'credito');

    await expect(
      concluir.executar(r.pendenteId, 'credito'),
    ).rejects.toBeInstanceOf(PendenciaExpiradaError);
  });

  it('categoria desconhecida → outros; sinônimo → categoria fechada; origem respeitada', async () => {
    const r = registrado(
      await registrar.executar({
        interpretacao: interpretacao({
          gastos: [
            gasto({ categoria: 'supermercado' }),
            gasto({ categoria: 'xpto' }),
          ],
        }),
        origem: 'audio',
      }),
    );

    expect(r.gastos.map((g) => g.categoria)).toEqual(['mercado', 'outros']);
    expect(r.gastos[0]?.origem).toBe('audio');
  });

  it('valor inválido ou data futura → erro de domínio e nada salvo', async () => {
    await expect(
      executar(interpretacao({ gastos: [gasto({ valorReais: 0.001 })] })),
    ).rejects.toBeInstanceOf(ValorInvalidoError);
    await expect(
      executar(
        interpretacao({
          gastos: [gasto(), gasto({ dataGasto: '2026-10-11' })],
        }),
      ),
    ).rejects.toBeInstanceOf(DataFuturaError);
    expect(await salvos()).toBe(0);
  });

  it('Desfazer remove gasto, entrada e parcelamento do registro', async () => {
    await cadastrar(inter);
    const r = registrado(
      await executar(
        interpretacao({
          gastos: [gasto()],
          entradas: [entrada()],
          parcelamentos: [parcelamento()],
        }),
      ),
    );

    const removidos = await new DesfazerRegistroUseCase(
      mundo.registro,
      new RelogioFixo(AGORA),
    ).executar(r.registroId);

    expect(removidos).toBe(3);
    expect(await salvos()).toBe(0);
  });
});
