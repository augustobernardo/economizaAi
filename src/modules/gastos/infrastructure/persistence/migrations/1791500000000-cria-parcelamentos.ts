import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class CriaParcelamentos1791500000000 implements MigrationInterface {
  name = 'CriaParcelamentos1791500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE parcelamentos (
        id uuid PRIMARY KEY,
        cartao_id uuid NOT NULL REFERENCES cartoes (id) ON DELETE RESTRICT,
        descricao varchar(200) NOT NULL,
        categoria varchar(20) NOT NULL,
        valor_parcela_centavos integer NOT NULL,
        primeira_parcela_centavos integer NOT NULL,
        quantidade smallint NOT NULL,
        parcela_inicial smallint NOT NULL,
        data_compra date NOT NULL,
        mes_competencia_inicial char(7) NOT NULL,
        mes_fatura_inicial char(7) NOT NULL,
        origem varchar(10) NOT NULL,
        texto_original text NOT NULL,
        registro_id uuid NOT NULL,
        criado_em timestamptz NOT NULL,
        CONSTRAINT ck_parcelamentos_valores CHECK (valor_parcela_centavos > 0 AND primeira_parcela_centavos > 0),
        CONSTRAINT ck_parcelamentos_quantidade CHECK (quantidade BETWEEN 2 AND 48),
        CONSTRAINT ck_parcelamentos_parcela_inicial CHECK (parcela_inicial BETWEEN 1 AND quantidade),
        CONSTRAINT ck_parcelamentos_categoria CHECK (categoria IN ('alimentacao','mercado','transporte','moradia','saude','lazer','educacao','assinaturas','vestuario','outros')),
        CONSTRAINT ck_parcelamentos_origem CHECK (origem IN ('texto','audio')),
        CONSTRAINT ck_parcelamentos_meses CHECK (
          mes_competencia_inicial ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          AND mes_fatura_inicial ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        ),
        CONSTRAINT ck_parcelamentos_total CHECK (valor_parcela_centavos::bigint * (quantidade - 1) + primeira_parcela_centavos <= 5000000)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_parcelamentos_registro_id ON parcelamentos (registro_id)',
    );
    await queryRunner.query(
      'CREATE INDEX idx_parcelamentos_cartao_id ON parcelamentos (cartao_id)',
    );
  }

  // ATENÇÃO: este down apaga dados; faça backup antes de reverter.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_parcelamentos_cartao_id');
    await queryRunner.query('DROP INDEX idx_parcelamentos_registro_id');
    await queryRunner.query('DROP TABLE parcelamentos');
  }
}
