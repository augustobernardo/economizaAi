import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import { ResumirGastosUseCase } from './resumir-gastos.use-case.js';

const AGORA = new Date('2026-10-04T15:00:00Z');

describe('ResumirGastosUseCase', () => {
  it('resume os gastos do período', async () => {
    const repositorio = new InMemoryGastoRepository();
    await repositorio.salvarVarios([
      umGasto().em(AGORA).comData('2026-10-02').comValor(10).build(),
      umGasto().em(AGORA).comData('2026-10-03').comValor(30).build(),
      umGasto().em(AGORA).comData('2026-09-30').comValor(99).build(),
    ]);

    const { periodo, resumo } = await new ResumirGastosUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar({ mesRelativo: 0 });

    expect(periodo.slug).toBe('2026-10');
    expect(resumo.quantidade).toBe(2);
    expect(resumo.total.centavos).toBe(4000);
  });

  it('período vazio → NenhumGastoNoPeriodoError', async () => {
    const useCase = new ResumirGastosUseCase(
      new InMemoryGastoRepository(),
      new RelogioFixo(AGORA),
    );

    await expect(useCase.executar({ mesRelativo: 0 })).rejects.toBeInstanceOf(
      NenhumGastoNoPeriodoError,
    );
  });
});
