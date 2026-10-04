import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';
import { URL_BANCO_DE_TESTE } from './url-banco-de-teste.js';

/** globalSetup do Vitest: aplica as migrations no banco de teste. */
export default async function setup(): Promise<void> {
  const dataSource = new DataSource(
    opcoesDoBanco(process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE),
  );
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    // Suítes em sequência (integration -> e2e) não podem herdar linhas da anterior.
    await dataSource.query('DELETE FROM gastos');
  } finally {
    await dataSource.destroy();
  }
}
