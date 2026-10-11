import type { Entrada } from '../../src/modules/gastos/domain/entrada.js';
import type { EntradaRepository } from '../../src/modules/gastos/domain/ports/entrada.repository.js';
import { ColecaoEmMemoria } from './colecao-em-memoria.js';

export class InMemoryEntradaRepository
  extends ColecaoEmMemoria<Entrada>
  implements EntradaRepository
{
  async listarPorPeriodo(
    inicio: string,
    fimExclusivo: string,
  ): Promise<Entrada[]> {
    return this.itens
      .filter((e) => e.dataEntrada >= inicio && e.dataEntrada < fimExclusivo)
      .sort(
        (a, b) =>
          a.dataEntrada.localeCompare(b.dataEntrada) ||
          a.criadoEm.getTime() - b.criadoEm.getTime(),
      );
  }

  async listarReembolsosDaFatura(
    cartaoId: string,
    mesFatura: string,
  ): Promise<Entrada[]> {
    return this.itens.filter(
      (e) =>
        e.vinculo?.cartaoId === cartaoId && e.vinculo.mesFatura === mesFatura,
    );
  }

  usaCartao(cartaoId: string): boolean {
    return this.itens.some((e) => e.vinculo?.cartaoId === cartaoId);
  }
}
