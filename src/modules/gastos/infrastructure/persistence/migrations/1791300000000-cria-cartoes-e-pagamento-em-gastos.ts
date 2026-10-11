import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class CriaCartoesEPagamentoEmGastos1791300000000 implements MigrationInterface {
  name = 'CriaCartoesEPagamentoEmGastos1791300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE cartoes (
        id uuid PRIMARY KEY,
        nome varchar(30) NOT NULL,
        nome_normalizado varchar(120) NOT NULL,
        dia_fechamento smallint NOT NULL,
        dia_vencimento smallint NOT NULL,
        criado_em timestamptz NOT NULL,
        CONSTRAINT uq_cartoes_nome_normalizado UNIQUE (nome_normalizado),
        CONSTRAINT ck_cartoes_dias CHECK (dia_fechamento BETWEEN 1 AND 31 AND dia_vencimento BETWEEN 1 AND 31)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE gastos
        ADD COLUMN cartao_id uuid NULL REFERENCES cartoes (id) ON DELETE RESTRICT,
        ADD COLUMN forma_pagamento varchar(7) NULL,
        ADD COLUMN editado_em timestamptz NULL,
        ADD CONSTRAINT ck_gastos_forma CHECK (forma_pagamento IN ('credito','debito')),
        ADD CONSTRAINT ck_gastos_pagamento_junto CHECK ((cartao_id IS NULL) = (forma_pagamento IS NULL))
    `);
    await queryRunner.query(
      'CREATE INDEX idx_gastos_cartao_data ON gastos (cartao_id, data_gasto) WHERE cartao_id IS NOT NULL',
    );
  }

  // ATENÇÃO: este down apaga dados; faça backup antes de reverter.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_gastos_cartao_data');
    await queryRunner.query(`
      ALTER TABLE gastos
        DROP CONSTRAINT ck_gastos_pagamento_junto,
        DROP CONSTRAINT ck_gastos_forma,
        DROP COLUMN editado_em,
        DROP COLUMN forma_pagamento,
        DROP COLUMN cartao_id
    `);
    await queryRunner.query('DROP TABLE cartoes');
  }
}
