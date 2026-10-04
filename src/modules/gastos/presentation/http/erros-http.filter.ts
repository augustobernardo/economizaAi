import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  type Type,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../../../shared/domain/domain.error.js';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';

const MENSAGEM_422 = 'Não foi possível registrar os gastos dessa mensagem.';

/** Traduz erros conhecidos para HTTP com mensagem genérica; os demais caem no 500 padrão do Nest. */
@Catch(
  // @Catch exige construtor concreto; DomainError é abstrata.
  DomainError as unknown as Type<Error>,
  NenhumGastoEncontradoError,
  RespostaInvalidaDaIaError,
  ProvedorIndisponivelError,
)
export class ErrosHttpFilter implements ExceptionFilter<Error> {
  private readonly logger = new Logger(ErrosHttpFilter.name);

  catch(erro: Error, host: ArgumentsHost): void {
    const [statusCode, message] = this.traduzir(erro);
    this.logger.warn(erro.name); // só o nome: a mensagem pode conter texto do usuário
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message });
  }

  private traduzir(erro: Error): [number, string] {
    if (erro instanceof RespostaInvalidaDaIaError) {
      return [502, 'A IA devolveu uma resposta inválida. Tente novamente.'];
    }
    if (erro instanceof ProvedorIndisponivelError) {
      return [
        503,
        'O serviço de IA está indisponível no momento. Tente novamente mais tarde.',
      ];
    }
    return [422, MENSAGEM_422];
  }
}
