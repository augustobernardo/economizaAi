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

/** `registroId` vazio: todo gasto pertence a um registro (uma mensagem). */
export class RegistroIdVazioError extends DomainError {}

/** Início do período é posterior ao fim. */
export class PeriodoInvertidoError extends DomainError {}

/** Início do período é posterior a hoje em `America/Sao_Paulo`. */
export class PeriodoFuturoError extends DomainError {}

/** Período maior que `MAX_DIAS_PERIODO` dias. */
export class PeriodoLongoDemaisError extends DomainError {}

/** Nome de cartão vazio, longo (> 30) ou com caractere de controle/bidi. */
export class NomeDeCartaoInvalidoError extends DomainError {}

/** Dia de fechamento/vencimento fora de 1..31. */
export class DiaInvalidoError extends DomainError {}

/** Fechamento e vencimento a 0 ou a mais de MAX_DIAS_ATE_VENCIMENTO dias um do outro. */
export class IntervaloDeFaturaInvalidoError extends DomainError {}

/** Quantidade de parcelas fora de 2..48. */
export class QuantidadeDeParcelasInvalidaError extends DomainError {}

/** Parcela inicial fora de 1..quantidade. */
export class ParcelaInicialInvalidaError extends DomainError {}

/** Parcelamento sem total nem valor de parcela. */
export class ValorDoParcelamentoAusenteError extends DomainError {}

/** Valor inicial de fatura negativo, fracionado ou acima do teto. */
export class ValorInicialInvalidoError extends DomainError {}

/** Mês fora do formato `AAAA-MM` (01–12). */
export class MesInvalidoError extends DomainError {}

/** Vínculo de fatura em entrada que não é reembolso, ou com mês/cartão inválido. */
export class VinculoDeFaturaInvalidoError extends DomainError {}

/** Pagamento com `cartaoId` vazio ou forma fora de `FORMAS_PAGAMENTO`. */
export class PagamentoInvalidoError extends DomainError {}
