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

/** A mensagem não continha nenhum gasto; `textoOriginal` é o que foi lido/ouvido. */
export class NenhumGastoEncontradoError extends ApplicationError {
  constructor(
    message: string,
    readonly textoOriginal?: string,
  ) {
    super(message);
  }
}
