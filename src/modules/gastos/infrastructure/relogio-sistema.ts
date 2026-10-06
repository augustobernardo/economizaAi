import type { Relogio } from '../application/ports/relogio.js';

export class RelogioSistema implements Relogio {
  agora(): Date {
    return new Date();
  }
}
