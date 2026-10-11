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

/** Teto de segurança por lançamento: R$ 50.000,00. Ver SECURITY.md §3.3/§4 (Etapa 2). */
export const TETO_VALOR_CENTAVOS = 5_000_000;

const JANELA_PASSADO_EM_ANOS = 1;

/** Valida o formato `YYYY-MM-DD` e que a data representa um dia real do calendário. */
export function validarFormatoData(data: string): void {
  if (!ehDataCivilValida(data)) {
    throw new DataInvalidaError(`Data inválida: "${data}"`);
  }
}

/** A data não pode ser futura nem anterior à janela de 1 ano, ambas em America/Sao_Paulo. */
export function validarJanelaData(data: string, agora: Date): void {
  const hoje = hojeEmSaoPaulo(agora);
  if (data > hoje) {
    throw new DataFuturaError(`Data "${data}" é posterior a hoje ("${hoje}")`);
  }

  const limiteInferior = subtrairAnos(hoje, JANELA_PASSADO_EM_ANOS);
  if (data < limiteInferior) {
    throw new DataForaDaJanelaError(
      `Data "${data}" é anterior à janela permitida ("${limiteInferior}")`,
    );
  }
}

export function validarDescricao(descricao: string): string {
  const descricaoTrimada = descricao.trim();
  if (descricaoTrimada === '') {
    throw new DescricaoVaziaError('Descrição vazia ou só com espaços');
  }
  return descricaoTrimada;
}

export function validarTeto(valor: Dinheiro): void {
  if (valor.centavos > TETO_VALOR_CENTAVOS) {
    throw new ValorAcimaDoTetoError(
      `Valor ${valor.centavos} centavos acima do teto de ${TETO_VALOR_CENTAVOS}`,
    );
  }
}

export function validarRegistroId(registroId: string): void {
  if (registroId.trim() === '') {
    throw new RegistroIdVazioError('registroId vazio');
  }
}

/**
 * Invariantes comuns a `criar` e `editar` de lançamentos; devolve a descrição
 * normalizada. `validarData: false` pula formato e janela (edição sem mudar a data).
 */
export function validarCamposComuns(c: {
  descricao: string;
  data: string;
  valor: Dinheiro;
  agora: Date;
  validarData: boolean;
}): string {
  const descricao = validarDescricao(c.descricao);
  if (c.validarData) {
    validarFormatoData(c.data);
    validarJanelaData(c.data, c.agora);
  }
  validarTeto(c.valor);
  return descricao;
}
