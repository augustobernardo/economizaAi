import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import type { Relogio } from '../ports/relogio.js';

/** Por quanto tempo um registro ainda pode ser desfeito (SECURITY.md §3.2). */
export const JANELA_DESFAZER_MS = 60 * 60 * 1000;

export class DesfazerRegistroUseCase {
  constructor(
    private readonly repositorio: GastoRepository,
    private readonly relogio: Relogio,
  ) {}

  /** Devolve quantos gastos removeu; 0 = expirado, já desfeito ou inexistente. */
  async executar(registroId: string): Promise<number> {
    const criadoDesde = new Date(
      this.relogio.agora().getTime() - JANELA_DESFAZER_MS,
    );
    return this.repositorio.removerDoRegistro(registroId, criadoDesde);
  }
}
