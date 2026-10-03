import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { DesfazerRegistroUseCase } from './desfazer-registro.use-case.js';

describe('DesfazerRegistroUseCase', () => {
  it('remove os ids', async () => {
    const repositorio = new InMemoryGastoRepository();
    const a = umGasto().build();
    const b = umGasto().build();
    await repositorio.salvarVarios([a, b]);

    await new DesfazerRegistroUseCase(repositorio).executar([a.id]);

    const restantes = await repositorio.listarPorPeriodo(
      '0000-01-01',
      '9999-12-31',
    );
    expect(restantes.map((g) => g.id)).toEqual([b.id]);
  });

  it('lista vazia não chama o repositório', async () => {
    const repositorio = new InMemoryGastoRepository();
    let chamadas = 0;
    repositorio.removerPorIds = async () => {
      chamadas++;
    };

    await new DesfazerRegistroUseCase(repositorio).executar([]);

    expect(chamadas).toBe(0);
  });
});
