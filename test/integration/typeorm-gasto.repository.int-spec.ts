import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { opcoesDoBanco } from '../../src/database/opcoes.js';
import { Dinheiro } from '../../src/modules/gastos/domain/dinheiro.js';
import { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import { TypeOrmGastoRepository } from '../../src/modules/gastos/infrastructure/persistence/typeorm-gasto.repository.js';
import { testarContratoGastoRepository } from '../contracts/gasto-repository.contract.js';
import { URL_BANCO_DE_TESTE } from '../setup/url-banco-de-teste.js';
import { umGasto } from '../builders/gasto.builder.js';

const dataSource = new DataSource(
  opcoesDoBanco(process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE),
);
const repositorio = new TypeOrmGastoRepository(dataSource);

beforeAll(async () => {
  await dataSource.initialize();
});

afterAll(async () => {
  await dataSource.destroy();
});

async function limpar(): Promise<void> {
  await dataSource.query('DELETE FROM gastos');
}

testarContratoGastoRepository('TypeOrmGastoRepository', async () => ({
  repositorio,
  limpar,
}));

describe('TypeOrmGastoRepository (banco real)', () => {
  it('tudo ou nada: um gasto inválido desfaz o lote', async () => {
    await limpar();
    const valido = umGasto().build();
    const invalido = Gasto.restaurar({
      id: crypto.randomUUID(),
      valor: Dinheiro.deCentavos(6_000_000),
      categoria: 'outros',
      descricao: 'acima do teto',
      dataGasto: '2026-06-15',
      origem: 'texto',
      textoOriginal: 'x',
      criadoEm: new Date('2026-06-15T12:00:00Z'),
    });

    await expect(
      repositorio.salvarVarios([valido, invalido]),
    ).rejects.toThrow();

    const [{ count }] = await dataSource.query<[{ count: string }]>(
      'SELECT count(*) FROM gastos',
    );
    expect(Number(count)).toBe(0);
  });

  it.each([
    ['categoria', { categoria: 'inexistente' }],
    ['origem', { origem: 'fax' }],
  ])('CHECK do banco rejeita %s inválida', async (_campo, invalido) => {
    await limpar();
    const base = umGasto().build();
    const gasto = Gasto.restaurar({
      id: base.id,
      valor: base.valor,
      categoria: base.categoria,
      descricao: base.descricao,
      dataGasto: base.dataGasto,
      origem: base.origem,
      textoOriginal: base.textoOriginal,
      criadoEm: base.criadoEm,
      ...invalido,
    } as Parameters<typeof Gasto.restaurar>[0]);

    await expect(repositorio.salvarVarios([gasto])).rejects.toThrow();
  });

  it('trata dados de entrada como parâmetros, nunca como SQL', async () => {
    await limpar();
    const descricao = "'); DROP TABLE gastos; --";
    await repositorio.salvarVarios([umGasto().comDescricao(descricao).build()]);

    const lista = await repositorio.listarPorPeriodo(
      '2026-06-01',
      '2026-07-01',
    );

    expect(lista.map((g) => g.descricao)).toEqual([descricao]);
    const [{ tabela }] = await dataSource.query<[{ tabela: string | null }]>(
      `SELECT to_regclass('gastos') AS tabela`,
    );
    expect(tabela).not.toBeNull();
  });
});
