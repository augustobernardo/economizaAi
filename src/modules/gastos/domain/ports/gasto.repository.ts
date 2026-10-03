import type { Gasto } from '../gasto.js';

export interface GastoRepository {
  salvarVarios(gastos: Gasto[]): Promise<void>;
  removerPorIds(ids: string[]): Promise<void>;
  listarPorPeriodo(inicio: Date, fim: Date): Promise<Gasto[]>;
}

export const GASTO_REPOSITORY = Symbol('GASTO_REPOSITORY');
