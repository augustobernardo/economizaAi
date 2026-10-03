import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class CriaTabelaGastos1791100000000 implements MigrationInterface {
  name = 'CriaTabelaGastos1791100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE gastos (
        id uuid PRIMARY KEY,
        valor_centavos integer NOT NULL,
        categoria varchar(20) NOT NULL,
        descricao varchar(200) NOT NULL,
        data_gasto date NOT NULL,
        origem varchar(10) NOT NULL,
        texto_original text NOT NULL,
        criado_em timestamptz NOT NULL,
        CONSTRAINT ck_gastos_valor CHECK (valor_centavos > 0 AND valor_centavos <= 5000000),
        CONSTRAINT ck_gastos_categoria CHECK (categoria IN ('alimentacao','mercado','transporte','moradia','saude','lazer','educacao','assinaturas','vestuario','outros')),
        CONSTRAINT ck_gastos_origem CHECK (origem IN ('texto','audio'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_gastos_data_gasto ON gastos (data_gasto)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE gastos');
  }
}
