import type { Categoria } from './categoria.js';
import {
  ehDataCivilValida,
  hojeEmSaoPaulo,
  subtrairAnos,
} from './data-civil.js';
import type { Dinheiro } from './dinheiro.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  RegistroIdVazioError,
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
  /** Id do registro (mensagem) que criou o gasto; agrupa o Desfazer. */
  registroId: string;
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
}

/** Valida o formato `YYYY-MM-DD` e que a data representa um dia real do calendário. */
function validarFormatoData(dataGasto: string): void {
  if (!ehDataCivilValida(dataGasto)) {
    throw new DataInvalidaError(`Data inválida: "${dataGasto}"`);
  }
}

/** `dataGasto` não pode ser futura nem anterior à janela de 1 ano, ambas em America/Sao_Paulo. */
function validarJanelaData(dataGasto: string, agora: Date): void {
  const hoje = hojeEmSaoPaulo(agora);
  if (dataGasto > hoje) {
    throw new DataFuturaError(
      `Data do gasto "${dataGasto}" é posterior a hoje ("${hoje}")`,
    );
  }

  const limiteInferior = subtrairAnos(hoje, JANELA_DIAS_PASSADO_EM_ANOS);
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
    public readonly registroId: string,
  ) {}

  /** Cria um novo gasto, validando todas as invariantes de domínio. */
  static criar(props: PropsCriarGasto): Gasto {
    const descricao = validarDescricao(props.descricao);
    validarFormatoData(props.dataGasto);
    validarJanelaData(props.dataGasto, props.agora);
    validarTeto(props.valor);
    if (props.registroId.trim() === '') {
      throw new RegistroIdVazioError('registroId vazio');
    }

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
    );
  }
}
