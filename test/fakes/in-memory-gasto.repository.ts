import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { GastoRepository } from '../../src/modules/gastos/domain/ports/gasto.repository.js';
import { ColecaoEmMemoria } from './colecao-em-memoria.js';

export class InMemoryGastoRepository
  extends ColecaoEmMemoria<Gasto>
  implements GastoRepository
{
  async listarPorPeriodo(
    inicio: string,
    fimExclusivo: string,
  ): Promise<Gasto[]> {
    return this.itens
      .filter((g) => g.dataGasto >= inicio && g.dataGasto < fimExclusivo)
      .sort(
        (a, b) =>
          a.dataGasto.localeCompare(b.dataGasto) ||
          a.criadoEm.getTime() - b.criadoEm.getTime(),
      );
  }

  async listarUltimos(limite: number): Promise<Gasto[]> {
    return [...this.itens]
      .sort(
        (x, y) =>
          y.criadoEm.getTime() - x.criadoEm.getTime() ||
          y.id.localeCompare(x.id),
      )
      .slice(0, limite);
  }

  async listarCreditoDoCartao(
    cartaoId: string,
    inicio: string,
    fimExclusivo: string,
  ): Promise<Gasto[]> {
    return (await this.listarPorPeriodo(inicio, fimExclusivo)).filter(
      (g) =>
        g.pagamento?.cartaoId === cartaoId && g.pagamento.forma === 'credito',
    );
  }

  usaCartao(cartaoId: string): boolean {
    return this.itens.some((g) => g.pagamento?.cartaoId === cartaoId);
  }
}
