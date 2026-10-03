import type { GastoRepository } from '../../domain/ports/gasto.repository.js';

export class DesfazerRegistroUseCase {
  constructor(private readonly repositorio: GastoRepository) {}

  async executar(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repositorio.removerPorIds(ids);
  }
}
