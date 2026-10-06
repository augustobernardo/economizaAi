import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import {
  DesfazerRegistroUseCase,
  JANELA_DESFAZER_MS,
} from './desfazer-registro.use-case.js';

const AGORA = new Date('2026-06-15T15:00:00Z');

function todos(repositorio: InMemoryGastoRepository) {
  return repositorio.listarPorPeriodo('0000-01-01', '9999-12-31');
}

describe('DesfazerRegistroUseCase', () => {
  it('remove os gastos do registro e devolve a contagem', async () => {
    const repositorio = new InMemoryGastoRepository();
    const registro = crypto.randomUUID();
    const a = umGasto().doRegistro(registro).em(AGORA).build();
    const b = umGasto().doRegistro(registro).em(AGORA).build();
    const outro = umGasto().em(AGORA).build();
    await repositorio.salvarVarios([a, b, outro]);

    const removidos = await new DesfazerRegistroUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar(registro);

    expect(removidos).toBe(2);
    expect((await todos(repositorio)).map((g) => g.id)).toEqual([outro.id]);
  });

  it('registro mais antigo que a janela não é removido', async () => {
    const repositorio = new InMemoryGastoRepository();
    const registro = crypto.randomUUID();
    const antigo = umGasto()
      .doRegistro(registro)
      .em(new Date(AGORA.getTime() - JANELA_DESFAZER_MS - 1))
      .build();
    await repositorio.salvarVarios([antigo]);

    const removidos = await new DesfazerRegistroUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar(registro);

    expect(removidos).toBe(0);
    expect(await todos(repositorio)).toHaveLength(1);
  });

  it('exatamente no limite da janela ainda remove', async () => {
    const repositorio = new InMemoryGastoRepository();
    const registro = crypto.randomUUID();
    await repositorio.salvarVarios([
      umGasto()
        .doRegistro(registro)
        .em(new Date(AGORA.getTime() - JANELA_DESFAZER_MS))
        .build(),
    ]);

    const removidos = await new DesfazerRegistroUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar(registro);

    expect(removidos).toBe(1);
  });

  it('registro inexistente devolve 0', async () => {
    const removidos = await new DesfazerRegistroUseCase(
      new InMemoryGastoRepository(),
      new RelogioFixo(AGORA),
    ).executar(crypto.randomUUID());

    expect(removidos).toBe(0);
  });
});
