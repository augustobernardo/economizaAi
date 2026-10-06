import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { DataInvalidaError } from '../../domain/errors.js';
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

  it('mês informado resume só aquele mês', async () => {
    const repositorio = new InMemoryGastoRepository();
    await repositorio.salvarVarios([
      umGasto().em(AGORA).comData('2026-09-01').comValor(10).build(),
      umGasto().em(AGORA).comData('2026-09-30').comValor(20).build(),
      umGasto().em(AGORA).comData('2026-10-01').comValor(99).build(),
      umGasto().em(AGORA).comData('2026-08-31').comValor(99).build(),
    ]);

    const { resumo } = await new ResumirGastosUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar({ mes: '2026-09' });

    expect([resumo.quantidade, resumo.total.centavos]).toEqual([2, 3000]);
  });

  it('mês atual no fuso de São Paulo: 01/10 02h UTC ainda é setembro', async () => {
    const agora = new Date('2026-10-01T02:00:00Z');
    const repositorio = new InMemoryGastoRepository();
    await repositorio.salvarVarios([
      umGasto().em(agora).comData('2026-09-30').comValor(10).build(),
    ]);

    const { periodo, resumo } = await new ResumirGastosUseCase(
      repositorio,
      new RelogioFixo(agora),
    ).executar({ mesRelativo: 0 });

    expect(periodo.slug).toBe('2026-09');
    expect(resumo.quantidade).toBe(1);
  });

  it('mês vazio → NenhumGastoNoPeriodoError com o período', async () => {
    const useCase = new ResumirGastosUseCase(
      new InMemoryGastoRepository(),
      new RelogioFixo(AGORA),
    );

    await expect(useCase.executar({ mes: '2026-09' })).rejects.toMatchObject({
      periodo: { slug: '2026-09' },
    });
  });

  it('mês inválido → DataInvalidaError', async () => {
    const useCase = new ResumirGastosUseCase(
      new InMemoryGastoRepository(),
      new RelogioFixo(AGORA),
    );

    await expect(useCase.executar({ mes: '2026-13' })).rejects.toBeInstanceOf(
      DataInvalidaError,
    );
  });
});
