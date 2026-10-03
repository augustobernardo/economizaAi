import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// O env sintético usado aqui (NODE_ENV, DATABASE_URL, TELEGRAM_*, etc.) vem
// de `test.env` em vitest.config.e2e.ts — precisa existir em process.env
// antes da importação do AppModule acima, porque o ConfigModule.forRoot
// valida o ambiente já na decoração do módulo. Isso garante o e2e verde com
// ou sem um .env real na máquina, sem criar um arquivo .env.test.
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });
});
