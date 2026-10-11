import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class CriaEntradas1791600000000 implements MigrationInterface {
  name = 'CriaEntradas1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE entradas (
        id uuid PRIMARY KEY,
        valor_centavos integer NOT NULL,
        categoria varchar(20) NOT NULL,
        descricao varchar(200) NOT NULL,
        data_entrada date NOT NULL,
        origem varchar(10) NOT NULL,
        texto_original text NOT NULL,
        registro_id uuid NOT NULL,
        criado_em timestamptz NOT NULL,
        editado_em timestamptz NULL,
        cartao_id uuid NULL REFERENCES cartoes (id) ON DELETE RESTRICT,
        mes_fatura char(7) NULL,
        CONSTRAINT ck_entradas_valor CHECK (valor_centavos > 0 AND valor_centavos <= 5000000),
        CONSTRAINT ck_entradas_categoria CHECK (categoria IN ('salario','transferencia','reembolso','rendimento','venda','outros')),
        CONSTRAINT ck_entradas_origem CHECK (origem IN ('texto','audio')),
        CONSTRAINT ck_entradas_mes_fatura CHECK (mes_fatura IS NULL OR mes_fatura ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        CONSTRAINT ck_entradas_vinculo CHECK (
          (cartao_id IS NULL AND mes_fatura IS NULL)
          OR (cartao_id IS NOT NULL AND mes_fatura IS NOT NULL AND categoria = 'reembolso')
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_entradas_data_entrada ON entradas (data_entrada)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_entradas_registro_id ON entradas (registro_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_entradas_cartao_mes_fatura ON entradas (cartao_id, mes_fatura) WHERE cartao_id IS NOT NULL',
    );
  }

  // ATENÇÃO: este down apaga dados; faça backup antes de reverter.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_entradas_cartao_mes_fatura');
    await queryRunner.query('DROP INDEX idx_entradas_registro_id');
    await queryRunner.query('DROP INDEX idx_entradas_data_entrada');
    await queryRunner.query('DROP TABLE entradas');
  }
}
