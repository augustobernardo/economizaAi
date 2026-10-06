import type { ArgumentsHost } from '@nestjs/common';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { DataFuturaError } from '../../domain/errors.js';
import { ErrosHttpFilter } from './erros-http.filter.js';

function executar(erro: Error) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new ErrosHttpFilter().catch(erro, host);
  return { status: status.mock.calls[0][0], corpo: json.mock.calls[0][0] };
}

describe('ErrosHttpFilter', () => {
  it.each([
    [new NenhumGastoEncontradoError('segredo'), 422],
    [new DataFuturaError('segredo'), 422],
    [new RespostaInvalidaDaIaError('segredo'), 502],
    [new ProvedorIndisponivelError('segredo'), 503],
  ])('mapeia %s para %i sem vazar a mensagem original', (erro, codigo) => {
    const { status, corpo } = executar(erro);
    expect(status).toBe(codigo);
    expect(corpo.statusCode).toBe(codigo);
    expect(corpo.message).toEqual(expect.any(String));
    expect(corpo.message).not.toContain('segredo');
  });
});
