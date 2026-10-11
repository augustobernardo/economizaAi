import type { DataSourceOptions } from 'typeorm';
import { CartaoOrmEntity } from '../modules/gastos/infrastructure/persistence/cartao.orm-entity.js';
import { EntradaOrmEntity } from '../modules/gastos/infrastructure/persistence/entrada.orm-entity.js';
import { FaturaOrmEntity } from '../modules/gastos/infrastructure/persistence/fatura.orm-entity.js';
import { ParcelamentoOrmEntity } from '../modules/gastos/infrastructure/persistence/parcelamento.orm-entity.js';
import { GastoOrmEntity } from '../modules/gastos/infrastructure/persistence/gasto.orm-entity.js';
import { CriaTabelaGastos1791100000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791100000000-cria-tabela-gastos.js';
import { AdicionaRegistroIdEmGastos1791200000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791200000000-adiciona-registro-id-em-gastos.js';
import { CriaCartoesEPagamentoEmGastos1791300000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791300000000-cria-cartoes-e-pagamento-em-gastos.js';
import { CriaFaturas1791400000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791400000000-cria-faturas.js';
import { CriaParcelamentos1791500000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791500000000-cria-parcelamentos.js';
import { CriaEntradas1791600000000 } from '../modules/gastos/infrastructure/persistence/migrations/1791600000000-cria-entradas.js';

/** Arrays de classes (nunca globs); schema só muda por migration. */
export function opcoesDoBanco(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [
      GastoOrmEntity,
      CartaoOrmEntity,
      FaturaOrmEntity,
      ParcelamentoOrmEntity,
      EntradaOrmEntity,
    ],
    migrations: [
      CriaTabelaGastos1791100000000,
      AdicionaRegistroIdEmGastos1791200000000,
      CriaCartoesEPagamentoEmGastos1791300000000,
      CriaFaturas1791400000000,
      CriaParcelamentos1791500000000,
      CriaEntradas1791600000000,
    ],
    synchronize: false,
    migrationsRun: false,
  };
}
