import { beforeEach, describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { Cartao } from '../../domain/cartao.js';
import { MesInvalidoError } from '../../domain/errors.js';
import {
  CartaoNaoCadastradoError,
  EscolhaDeCartaoNecessariaError,
  NenhumCartaoCadastradoError,
} from '../errors.js';
import {
  CompositorDeFatura,
  ConsultarFaturaUseCase,
  InformarFaturaUseCase,
} from './faturas.use-cases.js';

const AGORA = new Date('2026-10-10T15:00:00Z');

describe('casos de uso de faturas', () => {
  let mundo: Mundo;
  let inter: Cartao;
  let consultar: ConsultarFaturaUseCase;
  let informar: InformarFaturaUseCase;

  const novoCartao = async (nome: string) => {
    const c = Cartao.criar({
      nome,
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    });
    await mundo.cartoes.salvar(c);
    return c;
  };

  beforeEach(async () => {
    mundo = criarMundoEmMemoria();
    const relogio = new RelogioFixo(AGORA);
    const compositor = new CompositorDeFatura(
      mundo.gastos,
      mundo.parcelamentos,
      mundo.entradas,
      mundo.faturas,
    );
    consultar = new ConsultarFaturaUseCase(mundo.cartoes, compositor, relogio);
    informar = new InformarFaturaUseCase(
      mundo.cartoes,
      mundo.faturas,
      compositor,
      relogio,
    );
    inter = await novoCartao('Inter');
  });

  const totalNov = async () =>
    (await consultar.executar({ cartao: 'inter', mes: '2026-11' }))[0]!
      .composicao.totalCentavos;

  it('ponta a ponta: inicial + compra + parcela − reembolso; débito fora; fecha no dia', async () => {
    await informar.executar({
      cartao: 'inter',
      mes: '2026-11',
      valorReais: 400,
    });
    await mundo.gastos.salvarVarios([
      umGasto()
        .em(AGORA)
        .comValor(30)
        .comData('2026-10-10')
        .noCartao(inter.id, 'credito')
        .build(),
      umGasto()
        .em(AGORA)
        .comValor(999)
        .comData('2026-10-10')
        .noCartao(inter.id, 'debito')
        .build(),
      umGasto()
        .em(AGORA)
        .comValor(7)
        .comData('2026-10-03')
        .noCartao(inter.id, 'credito')
        .build(),
    ]);
    expect(await totalNov()).toBe(43_000);

    const parcelamento = umParcelamento()
      .noCartao(inter.id)
      .deParcela(10_000)
      .em(10)
      .compradoEm('2026-10-10', '2026-11')
      .build();
    await mundo.registro.salvar({
      gastos: [],
      entradas: [],
      parcelamentos: [parcelamento],
    });
    expect(await totalNov()).toBe(53_000);

    const reembolso = umaEntrada()
      .comCategoria('reembolso')
      .em(AGORA)
      .comValor(38.5)
      .vinculadaA({ cartaoId: inter.id, mesFatura: '2026-11' })
      .build();
    await mundo.registro.salvar({
      gastos: [],
      entradas: [reembolso],
      parcelamentos: [],
    });
    expect(await totalNov()).toBe(49_150);
  });

  it('compra de 2026-10-03 (dia do fechamento) cai na fatura de out, não de nov', async () => {
    await mundo.gastos.salvarVarios([
      umGasto()
        .em(AGORA)
        .comValor(7)
        .comData('2026-10-03')
        .noCartao(inter.id, 'credito')
        .build(),
    ]);
    const [{ composicao: out }] = await consultar.executar({
      cartao: 'inter',
      mes: '2026-10',
    });
    expect(out!.totalCentavos).toBe(700);
    expect(await totalNov()).toBe(0);
  });

  it('mes nulo consulta a próxima fatura em aberto', async () => {
    const [r] = await consultar.executar({ cartao: 'inter', mes: null });
    expect(r!.composicao.mes).toBe('2026-11');
  });

  it('cartao nulo consulta todos os cartões; nenhum → NenhumCartaoCadastradoError', async () => {
    await novoCartao('Nubank');
    const r = await consultar.executar({ cartao: null, mes: '2026-11' });
    expect(r.map((x) => x.cartao.nome)).toEqual(['Inter', 'Nubank']);
    await mundo.cartoes.remover(inter.id);
    const outro = (await mundo.cartoes.listar())[0]!;
    await mundo.cartoes.remover(outro.id);
    await expect(
      consultar.executar({ cartao: null, mes: null }),
    ).rejects.toBeInstanceOf(NenhumCartaoCadastradoError);
  });

  it('cartão inexistente → CartaoNaoCadastradoError', async () => {
    await expect(
      consultar.executar({ cartao: 'xyz', mes: null }),
    ).rejects.toBeInstanceOf(CartaoNaoCadastradoError);
  });

  describe('informar', () => {
    it('devolve a anterior ao informar de novo; zero é válido', async () => {
      const a = await informar.executar({
        cartao: 'inter',
        mes: '2026-11',
        valorReais: 400,
      });
      expect(a.anterior).toBeNull();
      expect(a.fatura.valorInicial).toBe(40_000);
      const b = await informar.executar({
        cartao: 'inter',
        mes: '2026-11',
        valorReais: 0,
      });
      expect(b.anterior?.valorInicial).toBe(40_000);
      expect(b.composicao.totalCentavos).toBe(0);
    });

    it('converte reais fracionários sem erro de ponto flutuante', async () => {
      const r = await informar.executar({
        cartao: 'inter',
        mes: '2026-11',
        valorReais: 1234.56,
      });
      expect(r.fatura.valorInicial).toBe(123_456);
    });

    it('mes nulo usa a próxima fatura em aberto', async () => {
      const r = await informar.executar({
        cartao: 'inter',
        mes: null,
        valorReais: 10,
      });
      expect(r.fatura.mes).toBe('2026-11');
    });

    it('mês inválido → MesInvalidoError', async () => {
      await expect(
        informar.executar({ cartao: 'inter', mes: '2026-13', valorReais: 10 }),
      ).rejects.toBeInstanceOf(MesInvalidoError);
    });

    it('cartao nulo: um cartão é usado', async () => {
      const r = await informar.executar({
        cartao: null,
        mes: '2026-11',
        valorReais: 10,
      });
      expect(r.cartao.id).toBe(inter.id);
    });

    it('cartao nulo: vários → EscolhaDeCartaoNecessariaError com os nomes', async () => {
      await novoCartao('Nubank');
      const erro = await informar
        .executar({ cartao: null, mes: '2026-11', valorReais: 10 })
        .catch((e) => e);
      expect(erro).toBeInstanceOf(EscolhaDeCartaoNecessariaError);
      expect(erro.opcoes).toEqual(['Inter', 'Nubank']);
    });

    it('cartao nulo: nenhum → NenhumCartaoCadastradoError', async () => {
      await mundo.cartoes.remover(inter.id);
      await expect(
        informar.executar({ cartao: null, mes: '2026-11', valorReais: 10 }),
      ).rejects.toBeInstanceOf(NenhumCartaoCadastradoError);
    });
  });
});
