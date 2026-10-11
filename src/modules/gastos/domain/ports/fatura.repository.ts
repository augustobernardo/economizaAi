import type { FaturaInformada } from '../fatura.js';

export interface FaturaRepository {
  /** Upsert por (cartão, mês); devolve a fatura anterior, se havia. */
  salvar(fatura: FaturaInformada): Promise<FaturaInformada | null>;
  buscar(cartaoId: string, mes: string): Promise<FaturaInformada | null>;
}

export const FATURA_REPOSITORY = Symbol('FATURA_REPOSITORY');
