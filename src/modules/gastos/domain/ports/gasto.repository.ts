import type { Gasto } from '../gasto.js';

export interface GastoRepository {
  salvarVarios(gastos: Gasto[]): Promise<void>;
  removerPorIds(ids: string[]): Promise<void>;
  /** Datas civis `YYYY-MM-DD`; `inicio` inclusivo, `fimExclusivo` exclusivo; ordenado por `dataGasto`, `criadoEm`. */
  listarPorPeriodo(inicio: string, fimExclusivo: string): Promise<Gasto[]>;
}

export const GASTO_REPOSITORY = Symbol('GASTO_REPOSITORY');
