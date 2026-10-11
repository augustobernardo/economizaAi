import { beforeEach, describe, expect, it } from 'vitest';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { FakeExportador } from '../../../../../test/fakes/fake-exportador.js';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { Cartao } from '../../domain/cartao.js';
import { PeriodoFuturoError } from '../../domain/errors.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import { ExportarPeriodoUseCase } from './exportar-periodo.use-case.js';
import { CompositorDeFatura } from './faturas.use-cases.js';
import { ResumirPeriodoUseCase } from './resumir-periodo.use-case.js';

const AGORA = new Date('2026-10-04T15:00:00Z');

describe('ExportarPeriodoUseCase', () => {
  let mundo: Mundo;
  let csv: FakeExportador;
  let md: FakeExportador;
  let useCase: ExportarPeriodoUseCase;

  const guardar = (g: Parameters<Mundo['registro']['salvar']>[0]) =>
    mundo.registro.salvar(g);
  const vazio = { gastos: [], entradas: [], parcelamentos: [] };

  beforeEach(() => {
    mundo = criarMundoEmMemoria();
    csv = new FakeExportador('csv');
    md = new FakeExportador('md');
    const relogio = new RelogioFixo(AGORA);
    useCase = new ExportarPeriodoUseCase(
      new ResumirPeriodoUseCase(
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
      ),
      [csv, md],
    );
  });

  it('chama todos os exportadores com os dados do período', async () => {
    await guardar({
      ...vazio,
      gastos: [
        umGasto().em(AGORA).comData('2026-10-02').build(),
        umGasto().em(AGORA).comData('2026-10-03').build(),
      ],
    });

    const saida = await useCase.executar({ mesRelativo: 0 });

    expect(saida.quantidade).toBe(2);
    expect(saida.arquivos.map((a) => a.nomeArquivo)).toEqual([
      'fake-2026-10.csv',
      'fake-2026-10.md',
    ]);
    expect(csv.chamadas[0]?.gastos).toHaveLength(2);
    expect(md.chamadas[0]?.periodo).toBe(saida.periodo);
    expect(md.chamadas[0]?.resumo.totalGastosCentavos).toBe(10_000);
  });

  it('quantidade soma gastos, entradas e parcelas', async () => {
    const cartao = Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    });
    await mundo.cartoes.salvar(cartao);
    await guardar({
      gastos: [umGasto().em(AGORA).comData('2026-10-02').build()],
      entradas: [umaEntrada().em(AGORA).comData('2026-10-03').build()],
      parcelamentos: [
        umParcelamento()
          .noCartao(cartao.id)
          .aPartirDa(1, '2026-10', '2026-11')
          .build(),
      ],
    });

    const saida = await useCase.executar({ mesRelativo: 0 });

    expect(saida.quantidade).toBe(3);
  });

  it('ignora gastos fora do período, inclusive o dia seguinte ao fim', async () => {
    await guardar({
      ...vazio,
      gastos: [
        umGasto().em(AGORA).comData('2026-10-01').build(),
        umGasto().em(AGORA).comData('2026-10-02').build(),
        umGasto().em(AGORA).comData('2026-10-03').build(),
      ],
    });

    const saida = await useCase.executar({
      inicio: '2026-10-01',
      fim: '2026-10-02',
    });

    expect(saida.quantidade).toBe(2);
  });

  it('período vazio → NenhumGastoNoPeriodoError com o tipo do período', async () => {
    const erro = await useCase
      .executar({ mesRelativo: -1 })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NenhumGastoNoPeriodoError);
    expect((erro as NenhumGastoNoPeriodoError).periodo.tipo).toBe('mes');
    expect(csv.chamadas).toHaveLength(0);
  });

  it('período futuro → PeriodoFuturoError sem consultar exportadores', async () => {
    await expect(
      useCase.executar({ inicio: '2026-11-01', fim: '2026-11-30' }),
    ).rejects.toBeInstanceOf(PeriodoFuturoError);
    expect(csv.chamadas).toHaveLength(0);
  });
});
