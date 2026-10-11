import type { Entrada } from '../entrada.js';

export interface EntradaRepository {
  /** Datas civis `YYYY-MM-DD`; `inicio` inclusivo, `fimExclusivo` exclusivo; ordenado por `dataEntrada`, `criadoEm`. */
  listarPorPeriodo(inicio: string, fimExclusivo: string): Promise<Entrada[]>;
  listarReembolsosDaFatura(
    cartaoId: string,
    mesFatura: string,
  ): Promise<Entrada[]>;
}

export const ENTRADA_REPOSITORY = Symbol('ENTRADA_REPOSITORY');
