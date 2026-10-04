import { Test } from '@nestjs/testing';
import request from 'supertest';

describe('/dev/* em produção (e2e)', () => {
  const envOriginal = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = envOriginal;
  });

  it('não registra o endpoint de dev', async () => {
    process.env.NODE_ENV = 'production';
    // import dinâmico: o GastosModule decide os controllers na importação.
    const { AppModule } = await import('../src/app.module.js');
    const { TelegramBot } =
      await import('../src/modules/gastos/presentation/telegram/telegram-bot.js');
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramBot)
      .useValue({})
      .compile();
    const app = modulo.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/dev/gastos/texto')
        .send({ texto: 'gastei 50' })
        .expect(404);
      await request(app.getHttpServer())
        .get('/dev/exportar')
        .query({ inicio: '2026-01-01', fim: '2026-01-31', formato: 'csv' })
        .expect(404);
    } finally {
      await app.close();
    }
  });
});
