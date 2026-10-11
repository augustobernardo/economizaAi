import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  INTERPRETADOR_DE_MENSAGEM,
  type Interpretacao,
} from '../src/modules/gastos/application/ports/interpretador-de-mensagem.js';
import { RELOGIO } from '../src/modules/gastos/application/ports/relogio.js';

const AGORA = new Date('2026-10-10T15:00:00Z');

describe('/dev/cartoes e /dev/faturas (e2e)', () => {
  let app: INestApplication;
  let proxima: Interpretacao;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INTERPRETADOR_DE_MENSAGEM)
      .useValue({
        interpretar: async () => proxima,
        interpretarCorrecao: async () => {
          throw new Error('não usado');
        },
      })
      .overrideProvider(RELOGIO)
      .useValue({ agora: () => AGORA })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app
      .get(DataSource)
      .query(
        'TRUNCATE gastos, parcelamentos, entradas, faturas, cartoes CASCADE',
      );
  });

  afterAll(async () => {
    await app.close();
  });

  const mensagem = (i: Interpretacao) => {
    proxima = i;
    return request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'x' });
  };
  const total = async () =>
    (
      await request(app.getHttpServer())
        .get('/dev/faturas')
        .query({ cartao: 'inter', mes: '2026-11' })
        .expect(200)
    ).body.totalCentavos;

  it('compõe a fatura com inicial, compra e parcelamento, e desfaz', async () => {
    const http = app.getHttpServer();
    const criado = await request(http)
      .post('/dev/cartoes')
      .send({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
      .expect(201);
    expect(criado.body).toMatchObject({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
    });

    const inicial = await mensagem({
      intencao: 'informarFatura',
      cartao: 'Inter',
      mes: '2026-11',
      valorReais: 400,
      textoOriginal: 'x',
    }).expect(201);
    expect(inicial.body).toMatchObject({
      tipo: 'fatura-informada',
      totalCentavos: 40000,
    });

    await mensagem({
      intencao: 'registrar',
      entradas: [],
      parcelamentos: [],
      textoOriginal: 'x',
      gastos: [
        {
          valorReais: 30,
          categoria: 'outros',
          descricao: 'Compra',
          dataGasto: '2026-10-10',
          cartao: 'Inter',
          formaPagamento: 'credito',
        },
      ],
    }).expect(201);
    expect(await total()).toBe(43000);

    const parcelado = await mensagem({
      intencao: 'registrar',
      gastos: [],
      entradas: [],
      textoOriginal: 'x',
      parcelamentos: [
        {
          descricao: 'Geladeira',
          categoria: 'outros',
          cartao: 'Inter',
          totalReais: null,
          valorParcelaReais: 100,
          quantidade: 10,
          parcelaAtual: null,
          dataCompra: '2026-10-10',
        },
      ],
    }).expect(201);
    expect(parcelado.body.parcelamentos[0]).toMatchObject({
      quantidade: 10,
      valorParcelaCentavos: 10000,
      totalCentavos: 100000,
    });
    expect(await total()).toBe(53000);

    await request(http)
      .delete('/dev/gastos')
      .send({ registroId: parcelado.body.registroId })
      .expect(200);
    expect(await total()).toBe(43000);
  });

  it.each([
    { nome: '', diaFechamento: 3, diaVencimento: 10 },
    { nome: 'a'.repeat(31), diaFechamento: 3, diaVencimento: 10 },
    { nome: 'Inter', diaFechamento: 0, diaVencimento: 10 },
    { nome: 'Inter', diaFechamento: 3, diaVencimento: 0 },
    { nome: 'Inter', diaFechamento: 3, diaVencimento: 32 },
    { nome: 'Inter', diaFechamento: 3, diaVencimento: 10, extra: 1 },
  ])('devolve 400 para corpo inválido %j', async (corpo) => {
    await request(app.getHttpServer())
      .post('/dev/cartoes')
      .send(corpo)
      .expect(400);
  });

  it('devolve 400 para query inválida e 404 para cartão inexistente', async () => {
    const http = app.getHttpServer();
    await request(http)
      .get('/dev/faturas')
      .query({ cartao: 'inter', mes: 'novembro' })
      .expect(400);
    await request(http)
      .get('/dev/faturas')
      .query({ cartao: 'inter', mes: '2026-13' })
      .expect(400);
    await request(http)
      .get('/dev/faturas')
      .query({ cartao: 'inter' })
      .expect(400);
    await request(http)
      .get('/dev/faturas')
      .query({ cartao: 'fantasma', mes: '2026-11' })
      .expect(404);
  });

  it('devolve 409 para cartão duplicado', async () => {
    const http = app.getHttpServer();
    const corpo = { nome: 'Inter', diaFechamento: 3, diaVencimento: 10 };
    await request(http).post('/dev/cartoes').send(corpo).expect(201);
    await request(http)
      .post('/dev/cartoes')
      .send({ ...corpo, nome: 'inter' })
      .expect(409);
  });
});
