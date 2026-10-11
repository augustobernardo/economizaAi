import type { Periodo } from '../domain/periodo.js';

/** Erros da camada de aplicação: falhas de portas externas, não violações de invariante. */
abstract class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** O provedor de IA não respondeu (rede, cota, indisponibilidade). */
export class ProvedorIndisponivelError extends ApplicationError {}

/** A IA respondeu, mas fora do formato esperado. */
export class RespostaInvalidaDaIaError extends ApplicationError {}

/** Nenhum gasto no período pedido; carrega o período para a mensagem ao usuário. */
export class NenhumGastoNoPeriodoError extends ApplicationError {
  constructor(readonly periodo: Periodo) {
    super(`Nenhum gasto encontrado em ${periodo.descrever()}`);
  }
}

/** Ainda não há nenhum gasto registrado. */
export class NenhumGastoRegistradoError extends ApplicationError {}

/** A mensagem não continha nenhum gasto; `textoOriginal` é o que foi lido/ouvido. */
export class NenhumGastoEncontradoError extends ApplicationError {
  constructor(
    message: string,
    readonly textoOriginal?: string,
  ) {
    super(message);
  }
}

/** Já existe um cartão com o mesmo nome (comparado sem acento nem caixa). */
export class CartaoJaExisteError extends ApplicationError {}

/** A edição mirou um gasto ou entrada que já não existe (apagado no meio do caminho). */
export class RegistroAlteradoError extends ApplicationError {}

/** O cartão referenciado não existe. */
export class CartaoNaoEncontradoError extends ApplicationError {}

/** O nome citado não corresponde a nenhum cartão cadastrado. */
export class CartaoNaoCadastradoError extends ApplicationError {
  constructor(readonly nome: string) {
    super('Cartão não cadastrado');
  }
}

/** Foi preciso um cartão, mas não há nenhum cadastrado. */
export class NenhumCartaoCadastradoError extends ApplicationError {}

/** O cartão ainda tem lançamentos e não pode ser removido. */
export class CartaoEmUsoError extends ApplicationError {}

/** A pendência (botões de escolha) venceu ou nunca existiu. */
export class PendenciaExpiradaError extends ApplicationError {}

/** O valor respondido não está entre as opções oferecidas. */
export class EscolhaInvalidaError extends ApplicationError {}

/** Parcelamento só existe no crédito. */
export class ParcelamentoSemCreditoError extends ApplicationError {}

/** Vários cartões cadastrados e a mensagem não disse qual; `opcoes` são os nomes. */
export class EscolhaDeCartaoNecessariaError extends ApplicationError {
  constructor(readonly opcoes: string[]) {
    super('Escolha o cartão');
  }
}

/** O registro a editar não tem gastos nem entradas; `soParcelamento` diz que só restam parcelamentos. */
export class RegistroNaoEncontradoError extends ApplicationError {
  constructor(readonly soParcelamento = false) {
    super('Registro não encontrado');
  }
}

/** A correção não mudou nada. */
export class CorrecaoVaziaError extends ApplicationError {}

/** A edição removeria todos os lançamentos do registro. */
export class RegistroVazioError extends ApplicationError {}

/** A correção citou um número fora de 1..n. */
export class IndiceDeCorrecaoInvalidoError extends ApplicationError {}

/** A correção deixou o pagamento ambíguo (crédito ou débito? qual cartão?). */
export class EscolhaNecessariaNaEdicaoError extends ApplicationError {
  constructor() {
    super('Diga se foi no crédito ou no débito');
  }
}
