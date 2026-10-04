import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Linha da tabela `gastos`. Nunca sai de `infrastructure/persistence/`; use o mapper. */
@Entity('gastos')
export class GastoOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'integer', name: 'valor_centavos' })
  valorCentavos!: number;

  @Column({ type: 'varchar', length: 20 })
  categoria!: string;

  @Column({ type: 'varchar', length: 200 })
  descricao!: string;

  /** `date` volta como string `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'data_gasto' })
  dataGasto!: string;

  @Column({ type: 'varchar', length: 10 })
  origem!: string;

  @Column({ type: 'text', name: 'texto_original' })
  textoOriginal!: string;

  @Column({ type: 'timestamptz', name: 'criado_em' })
  criadoEm!: Date;
}
