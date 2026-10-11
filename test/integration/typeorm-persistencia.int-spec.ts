import { afterAll, beforeAll } from 'vitest';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';
import { TypeOrmCartaoRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-cartao.repository.js';
import { TypeOrmEntradaRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-entrada.repository.js';
import { TypeOrmFaturaRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-fatura.repository.js';
import { TypeOrmGastoRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-gasto.repository.js';
import { TypeOrmParcelamentoRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-parcelamento.repository.js';
import { TypeOrmRegistroRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-registro.repository.js';
import { testarContratoPersistencia } from '../contracts/persistencia.contract.js';
import { URL_BANCO_DE_TESTE } from '../setup/url-banco-de-teste.js';

const dataSource = new DataSource(
  opcoesDoBanco(process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE),
);

beforeAll(async () => {
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

testarContratoPersistencia('Repositórios TypeORM', async () => ({
  cartoes: new TypeOrmCartaoRepository(dataSource),
  faturas: new TypeOrmFaturaRepository(dataSource),
  parcelamentos: new TypeOrmParcelamentoRepository(dataSource),
  entradas: new TypeOrmEntradaRepository(dataSource),
  gastos: new TypeOrmGastoRepository(dataSource),
  registro: new TypeOrmRegistroRepository(dataSource),
  limpar: async () => {
    await dataSource.query(
      'TRUNCATE entradas, parcelamentos, gastos, faturas, cartoes',
    );
  },
}));
