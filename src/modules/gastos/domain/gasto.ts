import type { Categoria } from './categoria.js';
import type { Dinheiro } from './dinheiro.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  ValorAcimaDoTetoError,
} from './errors.js';

/** Teto de segurança por gasto: R$ 50.000,00. Ver SECURITY.md §3.3/§4 (Etapa 2). */
export const TETO_VALOR_CENTAVOS = 5_000_000;

const JANELA_DIAS_PASSADO_EM_ANOS = 1;

export type OrigemGasto = 'texto' | 'audio';

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
}

/** Formata uma data para `YYYY-MM-DD` no fuso de São Paulo. */
function dataEmSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(data);
}

/**
 * Formata os componentes UTC de uma data como `YYYY-MM-DD`, sem conversão de
 * fuso. Usado para aritmética de calendário (ex.: "1 ano atrás") sobre uma
 * data civil já resolvida, para não reintroduzir erro de fuso ao reconverter.
 */
function formatarDataUTC(data: Date): string {
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Valida o formato `YYYY-MM-DD` e que a data representa um dia real do calendário. */
function validarFormatoData(dataGasto: string): void {
  const resultado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataGasto);
  if (!resultado) {
    throw new DataInvalidaError(`Data inválida: "${dataGasto}"`);
  }

  const [, anoStr, mesStr, diaStr] = resultado;
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  const ehDataReal =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia;

  if (!ehDataReal) {
    throw new DataInvalidaError(`Data inválida: "${dataGasto}"`);
  }
}

/** `dataGasto` não pode ser futura nem anterior à janela de 1 ano, ambas em America/Sao_Paulo. */
function validarJanelaData(dataGasto: string, agora: Date): void {
  const hoje = dataEmSaoPaulo(agora);
  if (dataGasto > hoje) {
    throw new DataFuturaError(
      `Data do gasto "${dataGasto}" é posterior a hoje ("${hoje}")`,
    );
  }

  const partesHoje = hoje.split('-');
  const ano = Number(partesHoje[0]);
  const mes = Number(partesHoje[1]);
  const dia = Number(partesHoje[2]);
  const limiteInferior = formatarDataUTC(
    new Date(Date.UTC(ano - JANELA_DIAS_PASSADO_EM_ANOS, mes - 1, dia)),
  );
  if (dataGasto < limiteInferior) {
    throw new DataForaDaJanelaError(
      `Data do gasto "${dataGasto}" é anterior à janela permitida ("${limiteInferior}")`,
    );
  }
}

function validarDescricao(descricao: string): string {
  const descricaoTrimada = descricao.trim();
  if (descricaoTrimada === '') {
    throw new DescricaoVaziaError('Descrição vazia ou só com espaços');
  }
  return descricaoTrimada;
}

function validarTeto(valor: Dinheiro): void {
  if (valor.centavos > TETO_VALOR_CENTAVOS) {
    throw new ValorAcimaDoTetoError(
      `Valor ${valor.centavos} centavos acima do teto de ${TETO_VALOR_CENTAVOS}`,
    );
  }
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
  ) {}

  /** Cria um novo gasto, validando todas as invariantes de domínio. */
  static criar(props: PropsCriarGasto): Gasto {
    const descricao = validarDescricao(props.descricao);
    validarFormatoData(props.dataGasto);
    validarJanelaData(props.dataGasto, props.agora);
    validarTeto(props.valor);

    return new Gasto(
      crypto.randomUUID(),
      props.valor,
      props.categoria,
      descricao,
      props.dataGasto,
      props.origem,
      props.textoOriginal,
      props.agora,
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
    );
  }
}
