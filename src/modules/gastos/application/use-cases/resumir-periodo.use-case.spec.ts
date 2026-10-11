import { beforeEach, describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { Cartao } from '../../domain/cartao.js';
import { DataInvalidaError } from '../../domain/errors.js';
import { FaturaInformada } from '../../domain/fatura.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import { CompositorDeFatura } from './faturas.use-cases.js';
import { ResumirPeriodoUseCase } from './resumir-periodo.use-case.js';

const AGORA = new Date('2026-10-20T15:00:00Z');

describe('ResumirPeriodoUseCase', () => {
  let mundo: Mundo;
  let inter: Cartao;
  let useCase: ResumirPeriodoUseCase;

  const montar = (agora = AGORA) => {
    const relogio = new RelogioFixo(agora);
    return new ResumirPeriodoUseCase(
      mundo.gastos,
      mundo.entradas,
      mundo.parcelamentos,
      mundo.cartoes,
      mundo.faturas,
      new CompositorDeFatura(
        mundo.gastos,
        mundo.parcelamentos,
        mundo.entradas,
        mundo.faturas,
      ),
      relogio,
    );
  };

  beforeEach(async () => {
    mundo = criarMundoEmMemoria();
    inter = Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    });
    await mundo.cartoes.salvar(inter);
    useCase = montar();
  });

  const registrar = (itens: {
    gastos?: Parameters<Mundo['gastos']['salvarVarios']>[0];
    entradas?: Parameters<Mundo['registro']['salvar']>[0]['entradas'];
    parcelamentos?: Parameters<Mundo['registro']['salvar']>[0]['parcelamentos'];
  }) =>
    mundo.registro.salvar({
      gastos: itens.gastos ?? [],
      entradas: itens.entradas ?? [],
      parcelamentos: itens.parcelamentos ?? [],
    });

  it('resume outubro com entrada, compras, parcela e fatura', async () => {
    await registrar({
      entradas: [
        umaEntrada().em(AGORA).comValor(1000).comData('2026-10-05').build(),
      ],
      gastos: [
        umGasto().em(AGORA).comData('2026-10-08').comValor(50).build(),
        umGasto()
          .em(AGORA)
          .comData('2026-10-02')
          .comValor(200)
          .noCartao(inter.id, 'credito')
          .build(),
      ],
      parcelamentos: [
        umParcelamento()
          .noCartao(inter.id)
          .deParcela(10_000)
          .aPartirDa(1, '2026-10', '2026-10')
          .build(),
      ],
    });
    await mundo.faturas.salvar(
      FaturaInformada.criar({
        cartaoId: inter.id,
        mes: '2026-10',
        valorInicialCentavos: 30_000,
        agora: AGORA,
      }),
    );

    const { periodo, resumo, cartoes } = await useCase.executar({
      mesRelativo: 0,
    });

    expect(periodo.slug).toBe('2026-10');
    expect(resumo.entradas.totalCentavos).toBe(100_000);
    expect(resumo.compras?.total.centavos).toBe(25_000);
    expect(resumo.parcelas.totalCentavos).toBe(10_000);
    expect(resumo.totalGastosCentavos).toBe(35_000);
    expect(resumo.saldoCentavos).toBe(65_000);
    expect(resumo.faturas).toHaveLength(1);
    expect(resumo.faturas[0]?.cartaoNome).toBe('Inter');
    expect(resumo.faturas[0]?.composicao.totalCentavos).toBe(60_000);
    expect(cartoes.get(inter.id)?.nome).toBe('Inter');
  });

  it('período sem nada → NenhumGastoNoPeriodoError com o período', async () => {
    await expect(useCase.executar({ mes: '2026-09' })).rejects.toMatchObject({
      periodo: { slug: '2026-09' },
    });
    await expect(useCase.executar({ mes: '2026-09' })).rejects.toBeInstanceOf(
      NenhumGastoNoPeriodoError,
    );
  });

  it('fatura vazia e sem valor inicial fica fora do resumo', async () => {
    await registrar({
      gastos: [umGasto().em(AGORA).comData('2026-10-08').build()],
    });

    const { resumo } = await useCase.executar({ mesRelativo: 0 });

    expect(resumo.faturas).toEqual([]);
  });

  it('fatura com valor inicial zero informado entra no resumo', async () => {
    await registrar({
      gastos: [umGasto().em(AGORA).comData('2026-10-08').build()],
    });
    await mundo.faturas.salvar(
      FaturaInformada.criar({
        cartaoId: inter.id,
        mes: '2026-10',
        valorInicialCentavos: 0,
        agora: AGORA,
      }),
    );

    const { resumo } = await useCase.executar({ mesRelativo: 0 });

    expect(resumo.faturas).toHaveLength(1);
  });

  it('fatura que vence fora do período não entra', async () => {
    await registrar({
      gastos: [
        umGasto()
          .em(AGORA)
          .comData('2026-10-02')
          .noCartao(inter.id, 'credito')
          .build(),
      ],
    });

    const { resumo } = await useCase.executar({
      inicio: '2026-10-01',
      fim: '2026-10-09',
    });

    expect(resumo.faturas).toEqual([]);
  });

  it('período de vários meses soma uma parcela por mês', async () => {
    await registrar({
      parcelamentos: [
        umParcelamento()
          .noCartao(inter.id)
          .deParcela(10_000)
          .aPartirDa(1, '2026-09', '2026-10')
          .build(),
      ],
    });

    const { resumo } = await useCase.executar({
      inicio: '2026-09-01',
      fim: '2026-10-20',
    });

    expect(resumo.parcelas.itens).toHaveLength(2);
    expect(resumo.parcelas.totalCentavos).toBe(20_000);
  });

  it('mês inválido → DataInvalidaError', async () => {
    await expect(useCase.executar({ mes: '2026-13' })).rejects.toBeInstanceOf(
      DataInvalidaError,
    );
  });

  it('mês atual no fuso de São Paulo: 01/10 02h UTC ainda é setembro', async () => {
    await registrar({
      gastos: [
        umGasto()
          .em(new Date('2026-10-01T02:00:00Z'))
          .comData('2026-09-30')
          .build(),
      ],
    });

    const { periodo } = await montar(new Date('2026-10-01T02:00:00Z')).executar(
      {
        mesRelativo: 0,
      },
    );

    expect(periodo.slug).toBe('2026-09');
  });
});
