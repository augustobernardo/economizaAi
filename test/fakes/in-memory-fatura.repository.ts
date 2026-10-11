import type { FaturaInformada } from '../../src/modules/gastos/domain/fatura.js';
import type { FaturaRepository } from '../../src/modules/gastos/domain/ports/fatura.repository.js';

export class InMemoryFaturaRepository implements FaturaRepository {
  private faturas = new Map<string, FaturaInformada>();

  async salvar(fatura: FaturaInformada): Promise<FaturaInformada | null> {
    const chave = `${fatura.cartaoId}|${fatura.mes}`;
    const anterior = this.faturas.get(chave) ?? null;
    this.faturas.set(chave, fatura);
    return anterior;
  }

  async buscar(cartaoId: string, mes: string): Promise<FaturaInformada | null> {
    return this.faturas.get(`${cartaoId}|${mes}`) ?? null;
  }

  usaCartao(cartaoId: string): boolean {
    return [...this.faturas.values()].some((f) => f.cartaoId === cartaoId);
  }

  limpar(): void {
    this.faturas.clear();
  }
}
