import type { Gasto } from '../gasto.js';

export interface GastoRepository {
  salvarVarios(gastos: Gasto[]): Promise<void>;
  /** Remove os gastos do registro com `criadoEm >= criadoDesde`; devolve quantos removeu. */
  removerDoRegistro(registroId: string, criadoDesde: Date): Promise<number>;
  /** Datas civis `YYYY-MM-DD`; `inicio` inclusivo, `fimExclusivo` exclusivo; ordenado por `dataGasto`, `criadoEm`. */
  listarPorPeriodo(inicio: string, fimExclusivo: string): Promise<Gasto[]>;
  /** Devolve os `limite` gastos mais recentes por `criadoEm` desc, desempate por `id` desc. */
  listarUltimos(limite: number): Promise<Gasto[]>;
}

export const GASTO_REPOSITORY = Symbol('GASTO_REPOSITORY');
