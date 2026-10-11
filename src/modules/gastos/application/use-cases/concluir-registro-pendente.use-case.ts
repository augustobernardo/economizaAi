import { EscolhaInvalidaError, PendenciaExpiradaError } from '../errors.js';
import type { Pendencias } from '../ports/pendencias.js';
import {
  chaveDaEscolha,
  type RegistrarLancamentosUseCase,
  type RegistroPendente,
  type ResultadoRegistro,
} from './registrar-lancamentos.use-case.js';

/** Aplica a resposta do usuário à escolha pendente e tenta registrar de novo. */
export class ConcluirRegistroPendenteUseCase {
  constructor(
    private readonly registrar: RegistrarLancamentosUseCase,
    private readonly pendencias: Pendencias<RegistroPendente>,
  ) {}

  async executar(
    pendenteId: string,
    valor: string,
  ): Promise<ResultadoRegistro> {
    const pendente = this.obter(pendenteId);
    this.pendencias.descartar(pendenteId);
    return this.registrar.executar({
      interpretacao: pendente.interpretacao,
      origem: pendente.origem,
      escolhas: {
        ...pendente.escolhas,
        [chaveDaEscolha(pendente.proxima)]: valor,
      },
    });
  }

  /** Resposta pela posição em `opcoes` guardadas na pergunta; fora delas a pendência fica. */
  async executarPorIndice(
    pendenteId: string,
    indice: number,
  ): Promise<ResultadoRegistro> {
    const opcao = this.obter(pendenteId).opcoes[indice];
    if (!opcao) throw new EscolhaInvalidaError('Opção inexistente');
    return this.executar(pendenteId, opcao.valor);
  }

  private obter(pendenteId: string): RegistroPendente {
    const pendente = this.pendencias.obter(pendenteId);
    if (!pendente) throw new PendenciaExpiradaError('Pendência expirada');
    return pendente;
  }
}
