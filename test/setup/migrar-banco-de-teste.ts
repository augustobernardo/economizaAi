import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';

const URL_DE_TESTE_PADRAO =
  'postgresql://economizaai_app:economizaai_app_dev@localhost:5432/economizaai_test';

/** globalSetup do Vitest: aplica as migrations no banco de teste. */
export default async function setup(): Promise<void> {
  const dataSource = new DataSource(
    opcoesDoBanco(process.env.DATABASE_URL ?? URL_DE_TESTE_PADRAO),
  );
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
