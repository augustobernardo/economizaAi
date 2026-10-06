import { beforeEach, describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { FakeExportador } from '../../../../../test/fakes/fake-exportador.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { PeriodoFuturoError } from '../../domain/errors.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import { ExportarGastosUseCase } from './exportar-gastos.use-case.js';

const AGORA = new Date('2026-10-04T15:00:00Z');

describe('ExportarGastosUseCase', () => {
  let repositorio: InMemoryGastoRepository;
  let csv: FakeExportador;
  let md: FakeExportador;
  let useCase: ExportarGastosUseCase;

  beforeEach(() => {
    repositorio = new InMemoryGastoRepository();
    csv = new FakeExportador('csv');
    md = new FakeExportador('md');
    useCase = new ExportarGastosUseCase(
      repositorio,
      [csv, md],
      new RelogioFixo(AGORA),
    );
  });

  it('chama todos os exportadores com os gastos e o período', async () => {
    await repositorio.salvarVarios([
      umGasto().em(AGORA).comData('2026-10-02').build(),
      umGasto().em(AGORA).comData('2026-10-03').build(),
    ]);

    const saida = await useCase.executar({ mesRelativo: 0 });

    expect(saida.quantidade).toBe(2);
    expect(saida.arquivos.map((a) => a.nomeArquivo)).toEqual([
      'fake-2026-10.csv',
      'fake-2026-10.md',
    ]);
    expect(csv.chamadas[0]?.gastos).toHaveLength(2);
    expect(md.chamadas[0]?.periodo).toBe(saida.periodo);
  });

  it('ignora gastos fora do período, inclusive o dia seguinte ao fim', async () => {
    await repositorio.salvarVarios([
      umGasto().em(AGORA).comData('2026-10-01').build(),
      umGasto().em(AGORA).comData('2026-10-02').build(),
      umGasto().em(AGORA).comData('2026-10-03').build(),
    ]);

    const saida = await useCase.executar({
      inicio: '2026-10-01',
      fim: '2026-10-02',
    });

    expect(saida.quantidade).toBe(2);
  });

  it('mesRelativo 0 → 01/10 a 04/10', async () => {
    await repositorio.salvarVarios([
      umGasto().em(AGORA).comData('2026-10-04').build(),
    ]);

    const { periodo } = await useCase.executar({ mesRelativo: 0 });

    expect([periodo.inicio, periodo.fim]).toEqual(['2026-10-01', '2026-10-04']);
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
