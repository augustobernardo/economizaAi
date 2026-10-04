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
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = modulo.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/dev/gastos/texto')
        .send({ texto: 'gastei 50' })
        .expect(404);
    } finally {
      await app.close();
    }
  }, 30_000);
});
