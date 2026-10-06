import { describe, expect, it } from 'vitest';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from './errors.js';

describe.each([
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
  NenhumGastoEncontradoError,
])('$name', (Classe) => {
  it('é Error, tem name da classe e preserva a mensagem', () => {
    const erro = new Classe('falhou');

    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe(Classe.name);
    expect(erro.message).toBe('falhou');
  });
});
