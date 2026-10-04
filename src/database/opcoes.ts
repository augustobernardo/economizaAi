import type { DataSourceOptions } from 'typeorm';
import { GastoOrmEntity } from '../modules/gastos/infrastructure/persistence/gasto.orm-entity.js';
import { CriaTabelaGastos1791100000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791100000000-cria-tabela-gastos.js';

/** Arrays de classes (nunca globs); schema só muda por migration. */
export function opcoesDoBanco(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [GastoOrmEntity],
    migrations: [CriaTabelaGastos1791100000000],
    synchronize: false,
    migrationsRun: false,
  };
}
