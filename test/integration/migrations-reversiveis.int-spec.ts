import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';
import { URL_BANCO_DE_TESTE } from '../setup/url-banco-de-teste.js';

const TABELAS = ['cartoes', 'faturas', 'parcelamentos', 'entradas'];
const COLUNAS_DE_GASTOS = ['cartao_id', 'forma_pagamento', 'editado_em'];

async function tabelasExistentes(ds: DataSource): Promise<string[]> {
  const linhas: { table_name: string }[] = await ds.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [TABELAS],
  );
  return linhas.map((l) => l.table_name).sort();
}

async function colunasExistentes(ds: DataSource): Promise<string[]> {
  const linhas: { column_name: string }[] = await ds.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'gastos'
       AND column_name = ANY($1)`,
    [COLUNAS_DE_GASTOS],
  );
  return linhas.map((l) => l.column_name).sort();
}

describe('migrations novas', () => {
  it('são reversíveis: 4 downs removem o schema e runMigrations restaura', async () => {
    const ds = new DataSource(
      opcoesDoBanco(process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE),
    );
    await ds.initialize();
    try {
      await ds.query('DELETE FROM gastos');
      for (let i = 0; i < 4; i++) await ds.undoLastMigration();

      expect(await tabelasExistentes(ds)).toEqual([]);
      expect(await colunasExistentes(ds)).toEqual([]);
    } finally {
      await ds.runMigrations();
    }
    try {
      expect(await tabelasExistentes(ds)).toEqual([...TABELAS].sort());
      expect(await colunasExistentes(ds)).toEqual(
        [...COLUNAS_DE_GASTOS].sort(),
      );
    } finally {
      await ds.destroy();
    }
  });
});
