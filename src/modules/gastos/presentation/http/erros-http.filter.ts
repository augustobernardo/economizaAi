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
  CartaoEmUsoError,
  CartaoJaExisteError,
  CartaoNaoCadastradoError,
  CartaoNaoEncontradoError,
  EscolhaDeCartaoNecessariaError,
  NenhumCartaoCadastradoError,
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ParcelamentoSemCreditoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import {
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
} from '../../domain/errors.js';

const MENSAGEM_422 = 'Não foi possível registrar os gastos dessa mensagem.';

/** Traduz erros conhecidos para HTTP com mensagem genérica; os demais caem no 500 padrão do Nest. */
@Catch(
  // @Catch exige construtor concreto; DomainError é abstrata.
  DomainError as unknown as Type<Error>,
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  RespostaInvalidaDaIaError,
  ProvedorIndisponivelError,
  CartaoNaoCadastradoError,
  CartaoNaoEncontradoError,
  NenhumCartaoCadastradoError,
  CartaoJaExisteError,
  CartaoEmUsoError,
  EscolhaDeCartaoNecessariaError,
  ParcelamentoSemCreditoError,
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
    if (erro instanceof NenhumGastoNoPeriodoError) {
      return [404, 'Nenhum gasto encontrado no período informado.'];
    }
    if (erro instanceof NenhumGastoRegistradoError) {
      return [404, 'Nenhum gasto registrado.'];
    }
    if (
      erro instanceof CartaoNaoCadastradoError ||
      erro instanceof CartaoNaoEncontradoError ||
      erro instanceof NenhumCartaoCadastradoError
    ) {
      return [404, 'Cartão não cadastrado.'];
    }
    if (erro instanceof EscolhaDeCartaoNecessariaError) {
      return [422, 'Informe o cartão.'];
    }
    if (erro instanceof ParcelamentoSemCreditoError) {
      return [422, 'Parcelamento só no crédito.'];
    }
    if (
      erro instanceof CartaoJaExisteError ||
      erro instanceof CartaoEmUsoError
    ) {
      return [409, 'Conflito com um cartão existente.'];
    }
    if (
      erro instanceof PeriodoFuturoError ||
      erro instanceof PeriodoInvertidoError ||
      erro instanceof PeriodoLongoDemaisError
    ) {
      return [400, 'Período inválido.'];
    }
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
