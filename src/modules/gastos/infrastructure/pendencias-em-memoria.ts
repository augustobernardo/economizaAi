import { randomUUID } from 'node:crypto';
import type { Pendencias } from '../application/ports/pendencias.js';
import type { Relogio } from '../application/ports/relogio.js';

const TTL_PENDENCIA_MS = 15 * 60_000;
const MAXIMO_PENDENCIAS = 50;

// ponytail: some no restart; tabela própria se virar incômodo.
export class PendenciasEmMemoria<T> implements Pendencias<T> {
  private readonly itens = new Map<string, { valor: T; expiraEm: number }>();

  constructor(
    private readonly relogio: Relogio,
    private readonly ttlMs = TTL_PENDENCIA_MS,
    private readonly max = MAXIMO_PENDENCIAS,
  ) {}

  guardar(valor: T): string {
    this.limparVencidas();
    const id = randomUUID();
    this.itens.set(id, { valor, expiraEm: this.agora() + this.ttlMs });
    // Map mantém a ordem de inserção: a primeira chave é a mais antiga.
    while (this.itens.size > this.max) {
      // size > max >= 0 garante que há ao menos uma chave.
      this.itens.delete(this.itens.keys().next().value!);
    }
    return id;
  }

  obter(id: string): T | null {
    const item = this.itens.get(id);
    if (!item) return null;
    if (this.agora() >= item.expiraEm) {
      this.itens.delete(id);
      return null;
    }
    return item.valor;
  }

  descartar(id: string): void {
    this.itens.delete(id);
  }

  private limparVencidas(): void {
    const agora = this.agora();
    for (const [id, item] of this.itens) {
      if (agora >= item.expiraEm) this.itens.delete(id);
    }
  }

  private agora(): number {
    return this.relogio.agora().getTime();
  }
}
