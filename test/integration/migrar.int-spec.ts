import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';
import { migrar } from '../../src/database/migrar.js';
import { URL_BANCO_DE_TESTE } from '../setup/url-banco-de-teste.js';

describe('migrar', () => {
  it('é idempotente: sem pendências não aplica nada', async () => {
    const url = process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE;
    expect(await migrar(new DataSource(opcoesDoBanco(url)))).toEqual([]);
  });
});
