import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('retorna status ok', () => {
    const controller = new HealthController();

    expect(controller.verificar()).toEqual({ status: 'ok' });
  });
});
