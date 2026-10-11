import type { CategoriaEntrada } from './categoria-entrada.js';
import type { Dinheiro } from './dinheiro.js';
import { VinculoDeFaturaInvalidoError } from './errors.js';
import type { OrigemGasto } from './gasto.js';
import { validarCamposComuns, validarRegistroId } from './invariantes.js';
import { ehMesValido } from './mes.js';

/** Fatura de cartão a que um reembolso se refere. */
export interface VinculoFatura {
  cartaoId: string;
  /** Mês da fatura, `AAAA-MM`. */
  mesFatura: string;
}

export interface PropsCriarEntrada {
  valor: Dinheiro;
  categoria: CategoriaEntrada;
  descricao: string;
  /** Data civil `YYYY-MM-DD` em que o dinheiro entrou. */
  dataEntrada: string;
  origem: OrigemGasto;
  textoOriginal: string;
  /** Instante do registro, usado para validar `dataEntrada` e preencher `criadoEm`. */
  agora: Date;
  registroId: string;
  vinculo?: VinculoFatura | null;
}

export interface PropsRestaurarEntrada {
  id: string;
  valor: Dinheiro;
  categoria: CategoriaEntrada;
  descricao: string;
  dataEntrada: string;
  origem: OrigemGasto;
  textoOriginal: string;
  registroId: string;
  criadoEm: Date;
  editadoEm?: Date | null;
  vinculo?: VinculoFatura | null;
}

function validarVinculo(
  vinculo: VinculoFatura | null,
  categoria: CategoriaEntrada,
): void {
  if (vinculo === null) return;
  if (categoria !== 'reembolso') {
    throw new VinculoDeFaturaInvalidoError(
      'Só reembolso pode ter vínculo com fatura',
    );
  }
  if (!ehMesValido(vinculo.mesFatura)) {
    throw new VinculoDeFaturaInvalidoError(
      `Mês de fatura inválido: "${vinculo.mesFatura}"`,
    );
  }
  if (vinculo.cartaoId.trim() === '') {
    throw new VinculoDeFaturaInvalidoError(
      'cartaoId vazio no vínculo de fatura',
    );
  }
}

export interface AlteracoesEntrada {
  valor?: Dinheiro;
  descricao?: string;
  categoria?: CategoriaEntrada;
  dataEntrada?: string;
  /** `undefined` mantém; `null` remove o vínculo. */
  vinculo?: VinculoFatura | null;
}

/** Dinheiro que entrou (salário, reembolso, venda...). */
export class Entrada {
  private constructor(
    public readonly id: string,
    public readonly valor: Dinheiro,
    public readonly categoria: CategoriaEntrada,
    public readonly descricao: string,
    public readonly dataEntrada: string,
    public readonly origem: OrigemGasto,
    public readonly textoOriginal: string,
    public readonly registroId: string,
    public readonly criadoEm: Date,
    public readonly editadoEm: Date | null,
    public readonly vinculo: VinculoFatura | null,
  ) {}

  /** Cria uma nova entrada, validando todas as invariantes de domínio. */
  static criar(props: PropsCriarEntrada): Entrada {
    const vinculo = props.vinculo ?? null;
    const descricao = validarCamposComuns({
      descricao: props.descricao,
      data: props.dataEntrada,
      valor: props.valor,
      agora: props.agora,
      validarData: true,
    });
    validarVinculo(vinculo, props.categoria);
    validarRegistroId(props.registroId);

    return new Entrada(
      crypto.randomUUID(),
      props.valor,
      props.categoria,
      descricao,
      props.dataEntrada,
      props.origem,
      props.textoOriginal,
      props.registroId,
      props.agora,
      null,
      vinculo,
    );
  }

  /** Devolve uma cópia editada (mesma identidade), revalidando as invariantes contra `agora`. */
  editar(alteracoes: AlteracoesEntrada, agora: Date): Entrada {
    const campos = {
      valor: alteracoes.valor ?? this.valor,
      categoria: alteracoes.categoria ?? this.categoria,
      dataEntrada: alteracoes.dataEntrada ?? this.dataEntrada,
      vinculo:
        alteracoes.vinculo === undefined ? this.vinculo : alteracoes.vinculo,
    };
    const descricao = validarCamposComuns({
      descricao: alteracoes.descricao ?? this.descricao,
      data: campos.dataEntrada,
      valor: campos.valor,
      agora,
      validarData: alteracoes.dataEntrada !== undefined,
    });
    validarVinculo(campos.vinculo, campos.categoria);

    return new Entrada(
      this.id,
      campos.valor,
      campos.categoria,
      descricao,
      campos.dataEntrada,
      this.origem,
      this.textoOriginal,
      this.registroId,
      this.criadoEm,
      agora,
      campos.vinculo,
    );
  }

  /** Reidrata uma entrada persistida, sem revalidar regras dependentes do tempo. */
  static restaurar(props: PropsRestaurarEntrada): Entrada {
    return new Entrada(
      props.id,
      props.valor,
      props.categoria,
      props.descricao,
      props.dataEntrada,
      props.origem,
      props.textoOriginal,
      props.registroId,
      props.criadoEm,
      props.editadoEm ?? null,
      props.vinculo ?? null,
    );
  }
}
