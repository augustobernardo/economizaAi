import type { Categoria } from './categoria.js';
import type { Dinheiro } from './dinheiro.js';
import { PagamentoInvalidoError } from './errors.js';
import { validarCamposComuns, validarRegistroId } from './invariantes.js';

export { TETO_VALOR_CENTAVOS } from './invariantes.js';

export type OrigemGasto = 'texto' | 'audio';

export const FORMAS_PAGAMENTO = ['credito', 'debito'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Cartão e forma com que o gasto foi pago. */
export interface Pagamento {
  cartaoId: string;
  forma: FormaPagamento;
}

export interface PropsCriarGasto {
  valor: Dinheiro;
  categoria: Categoria;
  descricao: string;
  /** Data civil `YYYY-MM-DD` em que o gasto aconteceu. */
  dataGasto: string;
  origem: OrigemGasto;
  textoOriginal: string;
  /** Instante do registro, usado para validar `dataGasto` e preencher `criadoEm`. */
  agora: Date;
  /** Id do registro (mensagem) que criou o gasto; agrupa o Desfazer. */
  registroId: string;
  pagamento?: Pagamento | null;
}

export interface PropsRestaurarGasto {
  id: string;
  valor: Dinheiro;
  categoria: Categoria;
  descricao: string;
  dataGasto: string;
  origem: OrigemGasto;
  textoOriginal: string;
  criadoEm: Date;
  registroId: string;
  pagamento?: Pagamento | null;
  editadoEm?: Date | null;
}

/** `cartaoId` não vazio e `forma` dentro de `FORMAS_PAGAMENTO`. */
function validarPagamento(pagamento: Pagamento | null | undefined): void {
  if (!pagamento) return;
  if (pagamento.cartaoId.trim() === '') {
    throw new PagamentoInvalidoError('cartaoId vazio');
  }
  if (!FORMAS_PAGAMENTO.includes(pagamento.forma)) {
    throw new PagamentoInvalidoError(
      `Forma de pagamento inválida: "${pagamento.forma}"`,
    );
  }
}

export interface AlteracoesGasto {
  valor?: Dinheiro;
  descricao?: string;
  categoria?: Categoria;
  dataGasto?: string;
  /** `undefined` mantém; `null` remove o cartão. */
  pagamento?: Pagamento | null;
}

/** Entidade principal do domínio: um gasto registrado pelo dono. */
export class Gasto {
  private constructor(
    public readonly id: string,
    public readonly valor: Dinheiro,
    public readonly categoria: Categoria,
    public readonly descricao: string,
    public readonly dataGasto: string,
    public readonly origem: OrigemGasto,
    public readonly textoOriginal: string,
    public readonly criadoEm: Date,
    public readonly registroId: string,
    public readonly pagamento: Pagamento | null,
    public readonly editadoEm: Date | null,
  ) {}

  /** Cria um novo gasto, validando todas as invariantes de domínio. */
  static criar(props: PropsCriarGasto): Gasto {
    const descricao = validarCamposComuns({
      descricao: props.descricao,
      data: props.dataGasto,
      valor: props.valor,
      agora: props.agora,
      validarData: true,
    });
    validarPagamento(props.pagamento);
    validarRegistroId(props.registroId);

    return new Gasto(
      crypto.randomUUID(),
      props.valor,
      props.categoria,
      descricao,
      props.dataGasto,
      props.origem,
      props.textoOriginal,
      props.agora,
      props.registroId,
      props.pagamento ?? null,
      null,
    );
  }

  /** Devolve uma cópia editada (mesma identidade), revalidando as invariantes contra `agora`. */
  editar(alteracoes: AlteracoesGasto, agora: Date): Gasto {
    const valor = alteracoes.valor ?? this.valor;
    const dataGasto = alteracoes.dataGasto ?? this.dataGasto;
    const pagamento =
      alteracoes.pagamento === undefined
        ? this.pagamento
        : alteracoes.pagamento;
    const descricao = validarCamposComuns({
      descricao: alteracoes.descricao ?? this.descricao,
      data: dataGasto,
      valor,
      agora,
      validarData: alteracoes.dataGasto !== undefined,
    });
    validarPagamento(pagamento);

    return new Gasto(
      this.id,
      valor,
      alteracoes.categoria ?? this.categoria,
      descricao,
      dataGasto,
      this.origem,
      this.textoOriginal,
      this.criadoEm,
      this.registroId,
      pagamento,
      agora,
    );
  }

  /**
   * Reidrata um gasto já persistido, com todos os campos (inclusive `id` e
   * `criadoEm`). Não revalida regras dependentes do tempo (`dataGasto` no
   * futuro ou fora da janela) porque elas só fazem sentido no momento do
   * registro: um gasto antigo, válido quando criado, continua válido ao ser
   * lido do banco mesmo que a janela de 1 ano tenha avançado.
   */
  static restaurar(props: PropsRestaurarGasto): Gasto {
    return new Gasto(
      props.id,
      props.valor,
      props.categoria,
      props.descricao,
      props.dataGasto,
      props.origem,
      props.textoOriginal,
      props.criadoEm,
      props.registroId,
      props.pagamento ?? null,
      props.editadoEm ?? null,
    );
  }
}
