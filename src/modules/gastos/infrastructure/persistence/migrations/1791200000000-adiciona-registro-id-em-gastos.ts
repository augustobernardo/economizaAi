import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DDL constante: nenhum dado de entrada entra nestas queries. */
export class AdicionaRegistroIdEmGastos1791200000000 implements MigrationInterface {
  name = 'AdicionaRegistroIdEmGastos1791200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Linhas antigas viram registros individuais; o default só existe para o backfill.
    await queryRunner.query(
      'ALTER TABLE gastos ADD COLUMN registro_id uuid NOT NULL DEFAULT gen_random_uuid()',
    );
    await queryRunner.query(
      'ALTER TABLE gastos ALTER COLUMN registro_id DROP DEFAULT',
    );
    await queryRunner.query(
      'CREATE INDEX idx_gastos_registro_id ON gastos (registro_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_gastos_registro_id');
    await queryRunner.query('ALTER TABLE gastos DROP COLUMN registro_id');
  }
}
