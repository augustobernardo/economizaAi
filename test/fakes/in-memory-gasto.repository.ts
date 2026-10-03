import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { GastoRepository } from '../../src/modules/gastos/domain/ports/gasto.repository.js';

export class InMemoryGastoRepository implements GastoRepository {
  private gastos: Gasto[] = [];

  async salvarVarios(gastos: Gasto[]): Promise<void> {
    this.gastos.push(...gastos);
  }

  async removerPorIds(ids: string[]): Promise<void> {
    this.gastos = this.gastos.filter((g) => !ids.includes(g.id));
  }

  async listarPorPeriodo(
    inicio: string,
    fimExclusivo: string,
  ): Promise<Gasto[]> {
    return this.gastos
      .filter((g) => g.dataGasto >= inicio && g.dataGasto < fimExclusivo)
      .sort(
        (a, b) =>
          a.dataGasto.localeCompare(b.dataGasto) ||
          a.criadoEm.getTime() - b.criadoEm.getTime(),
      );
  }

  limpar(): void {
    this.gastos = [];
  }
}
