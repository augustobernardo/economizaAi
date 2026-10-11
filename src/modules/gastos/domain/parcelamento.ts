import type { Categoria } from './categoria.js';
import { hojeEmSaoPaulo } from './data-civil.js';
import { Dinheiro } from './dinheiro.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  MesInvalidoError,
  ParcelaInicialInvalidaError,
  QuantidadeDeParcelasInvalidaError,
  ValorAcimaDoTetoError,
  ValorDoParcelamentoAusenteError,
} from './errors.js';
import type { OrigemGasto } from './gasto.js';
import {
  TETO_VALOR_CENTAVOS,
  validarDescricao,
  validarFormatoData,
  validarJanelaData,
  validarRegistroId,
} from './invariantes.js';
import { ehMesValido, mesDe, mesesEntre, somarMeses } from './mes.js';

export const MIN_PARCELAS = 2;
export const MAX_PARCELAS = 48;

/** Uma parcela de um parcelamento, num mês específico. */
export interface Parcela {
  numero: number;
  quantidade: number;
  valor: Dinheiro;
}

interface CamposComuns {
  cartaoId: string;
  descricao: string;
  categoria: Categoria;
  quantidade: number;
  parcelaInicial: number;
  dataCompra: string;
  /** Mês de competência da parcela `parcelaInicial`. */
  mesCompetenciaInicial: string;
  /** Mês da fatura da parcela `parcelaInicial`. */
  mesFaturaInicial: string;
  origem: OrigemGasto;
  textoOriginal: string;
  registroId: string;
}

export interface PropsCriarParcelamento extends CamposComuns {
  totalCentavos?: number | null;
  valorParcelaCentavos?: number | null;
  agora: Date;
}

export interface PropsRestaurarParcelamento extends CamposComuns {
  id: string;
  valorParcela: Dinheiro;
  primeiraParcela: Dinheiro;
  criadoEm: Date;
}

/** Resolve `valorParcela` e `primeiraParcela`; a parcela informada vale mais que o total. */
function resolverValores(props: PropsCriarParcelamento): {
  valorParcela: Dinheiro;
  primeiraParcela: Dinheiro;
} {
  const { quantidade, totalCentavos, valorParcelaCentavos } = props;
  if (valorParcelaCentavos != null) {
    const valor = Dinheiro.deCentavos(valorParcelaCentavos);
    return { valorParcela: valor, primeiraParcela: valor };
  }
  if (totalCentavos == null) {
    throw new ValorDoParcelamentoAusenteError(
      'Informe o total ou o valor da parcela',
    );
  }
  // O total é o da compra inteira; o resto da divisão vai na parcela 1
  // (já paga quando parcelaInicial > 1: só a soma de todas bate com o total).
  const base = Math.floor(totalCentavos / quantidade);
  return {
    valorParcela: Dinheiro.deCentavos(base),
    primeiraParcela: Dinheiro.deCentavos(
      totalCentavos - base * (quantidade - 1),
    ),
  };
}

function validarMes(mes: string): void {
  if (!ehMesValido(mes)) {
    throw new MesInvalidoError(`Mês inválido: "${mes}"`);
  }
}

/**
 * Parcela 1: mesma janela de Gasto. Em andamento: sem data futura e sem compra
 * tão antiga que nenhuma parcela poderia estar em aberto (quantidade meses + 1 ano).
 */
function validarJanelaDaCompra(
  dataCompra: string,
  quantidade: number,
  parcelaInicial: number,
  agora: Date,
): void {
  if (parcelaInicial === 1) return validarJanelaData(dataCompra, agora);
  const hoje = hojeEmSaoPaulo(agora);
  if (dataCompra > hoje) {
    throw new DataFuturaError(
      `Data "${dataCompra}" é posterior a hoje ("${hoje}")`,
    );
  }
  const limite = somarMeses(mesDe(hoje), -(quantidade + 12));
  if (mesDe(dataCompra) < limite) {
    throw new DataForaDaJanelaError(
      `Compra "${dataCompra}" é antiga demais para ${quantidade} parcelas (limite: ${limite})`,
    );
  }
}

/** Compra parcelada num cartão: gera uma parcela por mês de competência/fatura. */
export class Parcelamento {
  private constructor(
    public readonly id: string,
    public readonly cartaoId: string,
    public readonly descricao: string,
    public readonly categoria: Categoria,
    public readonly valorParcela: Dinheiro,
    public readonly primeiraParcela: Dinheiro,
    public readonly quantidade: number,
    public readonly parcelaInicial: number,
    public readonly dataCompra: string,
    public readonly mesCompetenciaInicial: string,
    public readonly mesFaturaInicial: string,
    public readonly origem: OrigemGasto,
    public readonly textoOriginal: string,
    public readonly registroId: string,
    public readonly criadoEm: Date,
  ) {}

  static criar(props: PropsCriarParcelamento): Parcelamento {
    const { quantidade, parcelaInicial } = props;
    if (
      !Number.isInteger(quantidade) ||
      quantidade < MIN_PARCELAS ||
      quantidade > MAX_PARCELAS
    ) {
      throw new QuantidadeDeParcelasInvalidaError(
        `Quantidade de parcelas deve ser de ${MIN_PARCELAS} a ${MAX_PARCELAS}: ${quantidade}`,
      );
    }
    if (
      !Number.isInteger(parcelaInicial) ||
      parcelaInicial < 1 ||
      parcelaInicial > quantidade
    ) {
      throw new ParcelaInicialInvalidaError(
        `Parcela inicial deve ser de 1 a ${quantidade}: ${parcelaInicial}`,
      );
    }
    const descricao = validarDescricao(props.descricao);
    validarFormatoData(props.dataCompra);
    validarJanelaDaCompra(
      props.dataCompra,
      quantidade,
      parcelaInicial,
      props.agora,
    );
    validarMes(props.mesCompetenciaInicial);
    validarMes(props.mesFaturaInicial);
    validarRegistroId(props.registroId);

    const { valorParcela, primeiraParcela } = resolverValores(props);
    const total =
      valorParcela.centavos * (quantidade - 1) + primeiraParcela.centavos;
    if (total > TETO_VALOR_CENTAVOS) {
      throw new ValorAcimaDoTetoError(
        `Total ${total} centavos acima do teto de ${TETO_VALOR_CENTAVOS}`,
      );
    }

    return new Parcelamento(
      crypto.randomUUID(),
      props.cartaoId,
      descricao,
      props.categoria,
      valorParcela,
      primeiraParcela,
      quantidade,
      parcelaInicial,
      props.dataCompra,
      props.mesCompetenciaInicial,
      props.mesFaturaInicial,
      props.origem,
      props.textoOriginal,
      props.registroId,
      props.agora,
    );
  }

  /** Reidrata um parcelamento persistido, sem revalidar regras de tempo. */
  static restaurar(props: PropsRestaurarParcelamento): Parcelamento {
    return new Parcelamento(
      props.id,
      props.cartaoId,
      props.descricao,
      props.categoria,
      props.valorParcela,
      props.primeiraParcela,
      props.quantidade,
      props.parcelaInicial,
      props.dataCompra,
      props.mesCompetenciaInicial,
      props.mesFaturaInicial,
      props.origem,
      props.textoOriginal,
      props.registroId,
      props.criadoEm,
    );
  }

  get total(): Dinheiro {
    return Dinheiro.deCentavos(
      this.valorParcela.centavos * (this.quantidade - 1) +
        this.primeiraParcela.centavos,
    );
  }

  get ultimoMesFatura(): string {
    return somarMeses(
      this.mesFaturaInicial,
      this.quantidade - this.parcelaInicial,
    );
  }

  get ultimoMesCompetencia(): string {
    return somarMeses(
      this.mesCompetenciaInicial,
      this.quantidade - this.parcelaInicial,
    );
  }

  parcelaNoMes(mes: string): Parcela | null {
    return this.parcelaEm(this.mesCompetenciaInicial, mes);
  }

  parcelaNaFatura(mesFatura: string): Parcela | null {
    return this.parcelaEm(this.mesFaturaInicial, mesFatura);
  }

  restantesApos(numero: number): number {
    return this.quantidade - numero;
  }

  private parcelaEm(mesInicial: string, mes: string): Parcela | null {
    const numero = this.parcelaInicial + mesesEntre(mesInicial, mes);
    if (
      !Number.isInteger(numero) ||
      numero < this.parcelaInicial ||
      numero > this.quantidade
    )
      return null;
    return {
      numero,
      quantidade: this.quantidade,
      valor: numero === 1 ? this.primeiraParcela : this.valorParcela,
    };
  }
}
