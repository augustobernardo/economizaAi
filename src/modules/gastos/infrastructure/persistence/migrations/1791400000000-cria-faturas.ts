import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class CriaFaturas1791400000000 implements MigrationInterface {
  name = 'CriaFaturas1791400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE faturas (
        cartao_id uuid NOT NULL REFERENCES cartoes (id) ON DELETE RESTRICT,
        mes char(7) NOT NULL,
        valor_inicial_centavos integer NOT NULL,
        informada_em timestamptz NOT NULL,
        PRIMARY KEY (cartao_id, mes),
        CONSTRAINT ck_faturas_mes CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        CONSTRAINT ck_faturas_valor CHECK (valor_inicial_centavos BETWEEN 0 AND 5000000)
      )
    `);
  }

  // ATENÇÃO: este down apaga dados; faça backup antes de reverter.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE faturas');
  }
}
