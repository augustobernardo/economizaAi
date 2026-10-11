import type { Parcelamento } from '../parcelamento.js';

export interface ParcelamentoRepository {
  // ponytail: filtra em memória no domínio; query por intervalo de meses se passar de centenas.
  listarTodos(): Promise<Parcelamento[]>;
  buscarPorId(id: string): Promise<Parcelamento | null>;
  /** `false` quando o id não existe. */
  remover(id: string): Promise<boolean>;
}

export const PARCELAMENTO_REPOSITORY = Symbol('PARCELAMENTO_REPOSITORY');
