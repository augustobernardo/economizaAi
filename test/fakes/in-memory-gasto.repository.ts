import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { GastoRepository } from '../../src/modules/gastos/domain/ports/gasto.repository.js';

export class InMemoryGastoRepository implements GastoRepository {
  private gastos: Gasto[] = [];

  async salvarVarios(gastos: Gasto[]): Promise<void> {
    this.gastos.push(...gastos);
  }

  async removerDoRegistro(
    registroId: string,
    criadoDesde: Date,
  ): Promise<number> {
    const antes = this.gastos.length;
    this.gastos = this.gastos.filter(
      (g) => !(g.registroId === registroId && g.criadoEm >= criadoDesde),
    );
    return antes - this.gastos.length;
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

  async listarUltimos(limite: number): Promise<Gasto[]> {
    return [...this.gastos]
      .sort(
        (x, y) =>
          y.criadoEm.getTime() - x.criadoEm.getTime() ||
          y.id.localeCompare(x.id),
      )
      .slice(0, limite);
  }

  limpar(): void {
    this.gastos = [];
  }
}
