import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  INTERPRETADOR_DE_MENSAGEM,
  type Interpretacao,
} from '../src/modules/gastos/application/ports/interpretador-de-mensagem.js';

// Datas no fuso de referência (UTC pode já estar no dia seguinte).
const formatar = (instante: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(
    instante,
  );
const hoje = formatar(new Date());
const amanha = formatar(new Date(Date.now() + 86_400_000));
const ontem = formatar(new Date(Date.now() - 86_400_000));

describe('/dev/exportar (e2e)', () => {
  let app: INestApplication;
  // O interpretador falso devolve o que o teste pedir a cada chamada.
  let resposta: Interpretacao;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INTERPRETADOR_DE_MENSAGEM)
      .useValue({ interpretar: async () => resposta })
      .compile();
    app = modulo.createNestApplication();
    await app.init();

    resposta = {
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
    };
    await request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'uber e mercado' })
      .expect(201);
  });

  afterAll(async () => {
    await app.get(DataSource).query('DELETE FROM gastos');
    await app.close();
  });

  const exportar = (query: Record<string, string>) =>
    request(app.getHttpServer()).get('/dev/exportar').query(query);

  it('devolve o CSV do dia como anexo', async () => {
    const res = await exportar({
      inicio: hoje,
      fim: hoje,
      formato: 'csv',
    }).expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="economizaai-${hoje}.csv"`,
    );
    const corpo = res.text;
    expect(corpo.startsWith('﻿')).toBe(true);
    expect(corpo.split(/\r?\n/).filter((l) => l.trim() !== '')).toHaveLength(3);
  });

  it('devolve o Markdown quando formato=md', async () => {
    const res = await exportar({
      inicio: hoje,
      fim: hoje,
      formato: 'md',
    }).expect(200);

    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain(
      `economizaai-${hoje}.md`,
    );
  });

  it('dia sem gasto → 404 com mensagem genérica', async () => {
    const res = await exportar({
      inicio: ontem,
      fim: ontem,
      formato: 'csv',
    }).expect(404);
    expect(res.body.message).toBe(
      'Nenhum gasto encontrado no período informado.',
    );
  });

  it('formato desconhecido → 400', async () => {
    await exportar({ inicio: hoje, fim: hoje, formato: 'xlsx' }).expect(400);
  });

  it('parâmetro extra → 400', async () => {
    await exportar({
      inicio: hoje,
      fim: hoje,
      formato: 'csv',
      extra: '1',
    }).expect(400);
  });

  it('início no futuro → 422', async () => {
    await exportar({ inicio: amanha, fim: amanha, formato: 'csv' }).expect(422);
  });

  it('POST /dev/gastos/texto com pedido de exportação devolve os arquivos em base64', async () => {
    resposta = {
      intencao: 'exportar',
      inicio: hoje,
      fim: hoje,
      textoOriginal: 'exporta hoje',
    };
    const res = await request(app.getHttpServer())
      .post('/dev/gastos/texto')
      .send({ texto: 'exporta hoje' })
      .expect(201);

    expect(res.body).toMatchObject({ tipo: 'exportacao', quantidade: 2 });
    expect(
      res.body.arquivos.map((a: { nomeArquivo: string }) => a.nomeArquivo),
    ).toEqual([`economizaai-${hoje}.csv`, `economizaai-${hoje}.md`]);
    expect(
      Buffer.from(res.body.arquivos[0].base64, 'base64')
        .toString('utf8')
        .startsWith('﻿'),
    ).toBe(true);
  });
});
