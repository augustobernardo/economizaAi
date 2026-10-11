import type { Cartao } from '../cartao.js';

export interface CartaoRepository {
  /** Nome normalizado duplicado → `CartaoJaExisteError`. */
  salvar(cartao: Cartao): Promise<void>;
  /** Ordenado por nome. */
  listar(): Promise<Cartao[]>;
  buscarPorNome(nomeNormalizado: string): Promise<Cartao | null>;
  buscarPorId(id: string): Promise<Cartao | null>;
  /** `'em-uso'` quando há gasto, fatura, parcelamento ou entrada apontando para o cartão. */
  remover(id: string): Promise<'removido' | 'em-uso'>;
}

export const CARTAO_REPOSITORY = Symbol('CARTAO_REPOSITORY');
