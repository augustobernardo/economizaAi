import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { NenhumGastoRegistradoError } from '../errors.js';
import {
  LIMITE_ULTIMOS,
  ListarUltimosGastosUseCase,
} from './listar-ultimos-gastos.use-case.js';

describe('ListarUltimosGastosUseCase', () => {
  it('devolve o mais recente primeiro, limitado a 10 por padrão', async () => {
    const repositorio = new InMemoryGastoRepository();
    const gastos = Array.from({ length: 12 }, (_, i) =>
      umGasto()
        .em(new Date(Date.UTC(2026, 5, 15, 12, i)))
        .build(),
    );
    await repositorio.salvarVarios(gastos);

    const ultimos = await new ListarUltimosGastosUseCase(
      repositorio,
    ).executar();

    expect(LIMITE_ULTIMOS).toBe(10);
    expect(ultimos).toHaveLength(10);
    expect(ultimos[0]?.id).toBe(gastos[11]?.id);
  });

  it('respeita o limite informado', async () => {
    const repositorio = new InMemoryGastoRepository();
    await repositorio.salvarVarios([umGasto().build(), umGasto().build()]);

    const ultimos = await new ListarUltimosGastosUseCase(repositorio).executar(
      1,
    );

    expect(ultimos).toHaveLength(1);
  });

  it('sem gastos → NenhumGastoRegistradoError', async () => {
    await expect(
      new ListarUltimosGastosUseCase(new InMemoryGastoRepository()).executar(),
    ).rejects.toBeInstanceOf(NenhumGastoRegistradoError);
  });
});
