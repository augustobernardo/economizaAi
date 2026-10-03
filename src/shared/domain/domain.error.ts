/**
 * Classe base de todos os erros de domínio. Nunca é lançada diretamente —
 * cada violação de invariante estende esta classe com um nome específico.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
