import { beforeEach, describe, expect, it } from 'vitest';
import { FakeExtrator } from '../../../../../test/fakes/fake-extrator.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { DataFuturaError, ValorInvalidoError } from '../../domain/errors.js';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
} from '../errors.js';
import type {
  EntradaExtracao,
  GastoExtraido,
  ResultadoExtracao,
} from '../ports/extrator-de-gastos.js';
import { RegistrarGastosUseCase } from './registrar-gastos.use-case.js';

const AGORA = new Date('2026-06-15T15:00:00Z');
const ENTRADA: EntradaExtracao = {
  tipo: 'texto',
  texto: 'gastei 32,50 de uber',
};

function extraido(parcial: Partial<GastoExtraido> = {}): GastoExtraido {
  return {
    valorReais: 32.5,
    categoria: 'transporte',
    descricao: 'Uber',
    dataGasto: '2026-06-14',
    ...parcial,
  };
}

function resultado(
  gastos: GastoExtraido[],
  textoOriginal = 'gastei 32,50 de uber',
): ResultadoExtracao {
  return { gastos, textoOriginal };
}

describe('RegistrarGastosUseCase', () => {
  let repositorio: InMemoryGastoRepository;

  beforeEach(() => {
    repositorio = new InMemoryGastoRepository();
  });

  function montar(resposta: ResultadoExtracao | Error) {
    const extrator = new FakeExtrator(resposta);
    const useCase = new RegistrarGastosUseCase(
      extrator,
      repositorio,
      new RelogioFixo(AGORA),
    );
    return { extrator, useCase };
  }

  function salvos() {
    return repositorio.listarPorPeriodo('0000-01-01', '9999-12-31');
  }

  it('um gasto → salva 1 e devolve com id', async () => {
    const { useCase } = montar(resultado([extraido()]));

    const { gastos } = await useCase.executar(ENTRADA);

    expect(gastos).toHaveLength(1);
    expect(gastos[0]?.id).toBeTruthy();
    expect(gastos[0]?.valor.centavos).toBe(3250);
    expect(await salvos()).toHaveLength(1);
  });

  it('dois gastos → salva 2', async () => {
    const { useCase } = montar(
      resultado([extraido(), extraido({ descricao: 'Mercado' })]),
    );

    const { gastos } = await useCase.executar(ENTRADA);

    expect(gastos).toHaveLength(2);
    expect(await salvos()).toHaveLength(2);
  });

  it('lista vazia → NenhumGastoEncontradoError e nada salvo', async () => {
    const { useCase } = montar(resultado([]));

    await expect(useCase.executar(ENTRADA)).rejects.toBeInstanceOf(
      NenhumGastoEncontradoError,
    );
    expect(await salvos()).toHaveLength(0);
  });

  it("categoria 'supermercado' → mercado", async () => {
    const { useCase } = montar(
      resultado([extraido({ categoria: 'supermercado' })]),
    );

    const { gastos } = await useCase.executar(ENTRADA);

    expect(gastos[0]?.categoria).toBe('mercado');
  });

  it("categoria 'xpto' → outros", async () => {
    const { useCase } = montar(resultado([extraido({ categoria: 'xpto' })]));

    const { gastos } = await useCase.executar(ENTRADA);

    expect(gastos[0]?.categoria).toBe('outros');
  });

  it('valor 0.001 → ValorInvalidoError e nada salvo', async () => {
    const { useCase } = montar(resultado([extraido({ valorReais: 0.001 })]));

    await expect(useCase.executar(ENTRADA)).rejects.toBeInstanceOf(
      ValorInvalidoError,
    );
    expect(await salvos()).toHaveLength(0);
  });

  it("lote com um gasto de data futura '2026-06-16' → DataFuturaError e nada salvo", async () => {
    const { useCase } = montar(
      resultado([extraido(), extraido({ dataGasto: '2026-06-16' })]),
    );

    await expect(useCase.executar(ENTRADA)).rejects.toBeInstanceOf(
      DataFuturaError,
    );
    expect(await salvos()).toHaveLength(0);
  });

  it('passa relogio.agora() como dataReferencia', async () => {
    const { extrator, useCase } = montar(resultado([extraido()]));

    await useCase.executar(ENTRADA);

    expect(extrator.chamadas[0]?.dataReferencia).toBe(AGORA);
  });

  it('devolve textoOriginal do extrator', async () => {
    const { useCase } = montar(resultado([extraido()], 'texto transcrito'));

    const saida = await useCase.executar(ENTRADA);

    expect(saida.textoOriginal).toBe('texto transcrito');
  });

  it("origem 'texto'", async () => {
    const { useCase } = montar(resultado([extraido()]));

    const { gastos } = await useCase.executar(ENTRADA);

    expect(gastos[0]?.origem).toBe('texto');
  });

  it("origem 'audio' quando a entrada é áudio", async () => {
    const { useCase } = montar(resultado([extraido()]));

    const { gastos } = await useCase.executar({
      tipo: 'audio',
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    });

    expect(gastos[0]?.origem).toBe('audio');
  });

  it('erro do extrator propaga', async () => {
    const { useCase } = montar(new ProvedorIndisponivelError('x'));

    await expect(useCase.executar(ENTRADA)).rejects.toBeInstanceOf(
      ProvedorIndisponivelError,
    );
  });
});
