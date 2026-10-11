import type { Parcelamento } from '../../src/modules/gastos/domain/parcelamento.js';
import type { ParcelamentoRepository } from '../../src/modules/gastos/domain/ports/parcelamento.repository.js';
import { ColecaoEmMemoria } from './colecao-em-memoria.js';

export class InMemoryParcelamentoRepository
  extends ColecaoEmMemoria<Parcelamento>
  implements ParcelamentoRepository
{
  async listarTodos(): Promise<Parcelamento[]> {
    return [...this.itens].sort(
      (a, b) =>
        a.criadoEm.getTime() - b.criadoEm.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  async buscarPorId(id: string): Promise<Parcelamento | null> {
    return this.itens.find((p) => p.id === id) ?? null;
  }

  async remover(id: string): Promise<boolean> {
    return this.removerPorId(id);
  }

  usaCartao(cartaoId: string): boolean {
    return this.itens.some((p) => p.cartaoId === cartaoId);
  }
}
