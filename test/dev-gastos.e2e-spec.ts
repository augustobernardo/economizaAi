import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { INTERPRETADOR_DE_MENSAGEM } from '../src/modules/gastos/application/ports/interpretador-de-mensagem.js';
import { ProvedorIndisponivelError } from '../src/modules/gastos/application/errors.js';
import { FakeInterpretador } from './fakes/fake-interpretador.js';

// Data no fuso de referência (UTC pode já estar no dia seguinte e virar "futuro").
const hoje = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
}).format(new Date());

async function subir(
  interpretador: FakeInterpretador,
): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(INTERPRETADOR_DE_MENSAGEM)
    .useValue(interpretador)
    .compile();
  const app = modulo.createNestApplication();
  await app.init();
  return app;
}

async function contar(app: INestApplication): Promise<number> {
  const linhas = await app
    .get(DataSource)
    .query<{ n: string }[]>('SELECT count(*) AS n FROM gastos');
  return Number(linhas[0].n);
}

describe('/dev/gastos (e2e)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (!app) return;
    await app.get(DataSource).query('DELETE FROM gastos');
    await app.close();
    app = undefined;
  });

  it('registra dois gastos e desfaz pelo registroId', async () => {
    app = await subir(
      new FakeInterpretador({
        intencao: 'registrar',
        textoOriginal: 'uber e mercado',
        gastos: [
          {
            valorReais: 32.5,
            categoria: 'transporte',
            descricao: 'Uber',
            dataGasto: hoje,
          },
          {
            valorReais: 80,
            categoria: 'mercado',
            descricao: 'Mercado',
            dataGasto: hoje,
          },
        ],
      }),
    );
    const http = app.getHttpServer();
    const noApp = app;

    const criado = await request(http)
      .post('/dev/gastos/texto')
      .send({ texto: 'uber e mercado' })
      .expect(201);
    expect(criado.body.tipo).toBe('registro');
    expect(criado.body.gastos).toHaveLength(2);
    expect(criado.body.gastos[0]).toMatchObject({
      valorCentavos: 3250,
      valor: 'R$ 32,50',
    });
    expect(criado.body.registroId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await contar(noApp)).toBe(2);

    const desfeito = await request(http)
      .delete('/dev/gastos')
      .send({ registroId: criado.body.registroId })
      .expect(200);
    expect(desfeito.body).toEqual({ removidos: 2 });
    expect(await contar(noApp)).toBe(0);
  });

  it('devolve 422 quando a IA não encontra gastos', async () => {
    app = await subir(
      new FakeInterpretador({
        intencao: 'registrar',
        textoOriginal: 'oi',
        gastos: [],
      }),
    );
    await request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'oi' })
      .expect(422);
  });

  it('devolve 400 para campo extra no corpo', async () => {
    app = await subir(
      new FakeInterpretador({
        intencao: 'registrar',
        textoOriginal: '',
        gastos: [],
      }),
    );
    await request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'x', extra: 1 })
      .expect(400);
  });

  it('devolve 400 para registroId que não é UUID no DELETE', async () => {
    app = await subir(
      new FakeInterpretador({
        intencao: 'registrar',
        textoOriginal: '',
        gastos: [],
      }),
    );
    await request(app.getHttpServer())
      .delete('/dev/gastos')
      .send({ registroId: 'nao-e-uuid' })
      .expect(400);
  });

  it('devolve 400 para o contrato antigo { ids }', async () => {
    app = await subir(
      new FakeInterpretador({
        intencao: 'registrar',
        textoOriginal: '',
        gastos: [],
      }),
    );
    await request(app.getHttpServer())
      .delete('/dev/gastos')
      .send({ ids: [crypto.randomUUID()] })
      .expect(400);
  });

  it('devolve 503 quando o provedor de IA está indisponível', async () => {
    app = await subir(
      new FakeInterpretador(new ProvedorIndisponivelError('x')),
    );
    await request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'gastei 50' })
      .expect(503);
  });
});
