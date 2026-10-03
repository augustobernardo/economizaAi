import { DomainError } from '../../../shared/domain/domain.error.js';

/** Valor de `Dinheiro` inválido: zero, negativo, não numérico ou formato de texto não reconhecido. */
export class ValorInvalidoError extends DomainError {}

/** Valor acima do teto de segurança (`TETO_VALOR_CENTAVOS`). */
export class ValorAcimaDoTetoError extends DomainError {}

/** Descrição vazia ou só com espaços. */
export class DescricaoVaziaError extends DomainError {}

/** `dataGasto` não está no formato `YYYY-MM-DD` ou representa uma data que não existe. */
export class DataInvalidaError extends DomainError {}

/** `dataGasto` é posterior a hoje em `America/Sao_Paulo`. */
export class DataFuturaError extends DomainError {}

/** `dataGasto` é anterior à janela permitida (hoje − 1 ano) em `America/Sao_Paulo`. */
export class DataForaDaJanelaError extends DomainError {}
