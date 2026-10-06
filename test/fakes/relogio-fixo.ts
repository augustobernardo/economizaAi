import type { Relogio } from '../../src/modules/gastos/application/ports/relogio.js';

export class RelogioFixo implements Relogio {
  constructor(private readonly instante: Date) {}

  agora(): Date {
    return this.instante;
  }
}
