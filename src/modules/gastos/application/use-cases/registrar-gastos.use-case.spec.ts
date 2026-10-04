import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { DataFuturaError, ValorInvalidoError } from '../../domain/errors.js';
import { NenhumGastoEncontradoError } from '../errors.js';
import type { GastoExtraido } from '../ports/interpretador-de-mensagem.js';
import { RegistrarGastosUseCase } from './registrar-gastos.use-case.js';

const AGORA = new Date('2026-06-15T15:00:00Z');
const TEXTO = 'gastei 32,50 de uber';

function extraido(parcial: Partial<GastoExtraido> = {}): GastoExtraido {
  return {
    valorReais: 32.5,
    categoria: 'transporte',
    descricao: 'Uber',
    dataGasto: '2026-06-14',
    ...parcial,
  };
}

describe('RegistrarGastosUseCase', () => {
  let repositorio: InMemoryGastoRepository;

  beforeEach(() => {
    repositorio = new InMemoryGastoRepository();
  });

  function executar(
    gastos: GastoExtraido[],
    origem: 'texto' | 'audio' = 'texto',
    textoOriginal = TEXTO,
  ) {
    return new RegistrarGastosUseCase(
      repositorio,
      new RelogioFixo(AGORA),
    ).executar({ gastos, origem, textoOriginal });
  }

  function salvos() {
    return repositorio.listarPorPeriodo('0000-01-01', '9999-12-31');
  }

  it('um gasto → salva 1 e devolve com id', async () => {
    const { gastos } = await executar([extraido()]);

    expect(gastos).toHaveLength(1);
    expect(gastos[0]?.id).toBeTruthy();
    expect(gastos[0]?.valor.centavos).toBe(3250);
    expect(await salvos()).toHaveLength(1);
  });

  it('dois gastos → salva 2', async () => {
    const { gastos } = await executar([
      extraido(),
      extraido({ descricao: 'Mercado' }),
    ]);

    expect(gastos).toHaveLength(2);
    expect(await salvos()).toHaveLength(2);
  });

  it('lista vazia → NenhumGastoEncontradoError e nada salvo', async () => {
    await expect(executar([])).rejects.toBeInstanceOf(
      NenhumGastoEncontradoError,
    );
    expect(await salvos()).toHaveLength(0);
  });

  it('lista vazia → erro carrega o textoOriginal', async () => {
    const erro = await executar([], 'texto', 'bom dia, tudo bem?').catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(NenhumGastoEncontradoError);
    expect((erro as NenhumGastoEncontradoError).textoOriginal).toBe(
      'bom dia, tudo bem?',
    );
  });

  it("categoria 'supermercado' → mercado", async () => {
    const { gastos } = await executar([
      extraido({ categoria: 'supermercado' }),
    ]);

    expect(gastos[0]?.categoria).toBe('mercado');
  });

  it("categoria 'xpto' → outros", async () => {
    const { gastos } = await executar([extraido({ categoria: 'xpto' })]);

    expect(gastos[0]?.categoria).toBe('outros');
  });

  it('valor 0.001 → ValorInvalidoError e nada salvo', async () => {
    await expect(
      executar([extraido({ valorReais: 0.001 })]),
    ).rejects.toBeInstanceOf(ValorInvalidoError);
    expect(await salvos()).toHaveLength(0);
  });

  it("lote com um gasto de data futura '2026-06-16' → DataFuturaError e nada salvo", async () => {
    await expect(
      executar([extraido(), extraido({ dataGasto: '2026-06-16' })]),
    ).rejects.toBeInstanceOf(DataFuturaError);
    expect(await salvos()).toHaveLength(0);
  });

  it('devolve o textoOriginal recebido', async () => {
    const saida = await executar([extraido()], 'texto', 'texto transcrito');

    expect(saida.textoOriginal).toBe('texto transcrito');
  });

  it("origem 'texto' respeitada", async () => {
    const { gastos } = await executar([extraido()], 'texto');

    expect(gastos[0]?.origem).toBe('texto');
  });

  it("origem 'audio' respeitada", async () => {
    const { gastos } = await executar([extraido()], 'audio');

    expect(gastos[0]?.origem).toBe('audio');
  });

  it('todos os gastos da mensagem compartilham o registroId devolvido', async () => {
    const { registroId, gastos } = await executar([
      extraido(),
      extraido({ descricao: 'Mercado' }),
    ]);

    expect(registroId).toMatch(/^[0-9a-f-]{36}$/);
    expect(gastos.map((g) => g.registroId)).toEqual([registroId, registroId]);
  });

  it('mensagens diferentes geram registroIds diferentes', async () => {
    const a = await executar([extraido()]);
    const b = await executar([extraido()]);

    expect(a.registroId).not.toBe(b.registroId);
  });
});
