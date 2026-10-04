import { describe, expect, it } from 'vitest';
import { Periodo } from '../domain/periodo.js';
import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from './errors.js';

describe('NenhumGastoNoPeriodoError', () => {
  it('carrega o período e descreve na mensagem', () => {
    const periodo = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
    const erro = new NenhumGastoNoPeriodoError(periodo);
    expect(erro.periodo.tipo).toBe('mes');
    expect(erro.message).toBe('Nenhum gasto encontrado em agosto de 2026');
  });
});

describe.each([
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
  NenhumGastoEncontradoError,
  NenhumGastoRegistradoError,
])('$name', (Classe) => {
  it('é Error, tem name da classe e preserva a mensagem', () => {
    const erro = new Classe('falhou');

    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe(Classe.name);
    expect(erro.message).toBe('falhou');
  });
});

describe('NenhumGastoEncontradoError', () => {
  it('carrega o texto original quando informado', () => {
    const erro = new NenhumGastoEncontradoError('nada', 'bom dia');
    expect(erro.textoOriginal).toBe('bom dia');
  });

  it('textoOriginal é opcional', () => {
    expect(
      new NenhumGastoEncontradoError('nada').textoOriginal,
    ).toBeUndefined();
  });
});
