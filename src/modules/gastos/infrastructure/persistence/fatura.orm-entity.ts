import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Linha da tabela `faturas`. Nunca sai de `infrastructure/persistence/`; use o mapper. */
@Entity('faturas')
export class FaturaOrmEntity {
  @PrimaryColumn({ type: 'uuid', name: 'cartao_id' })
  cartaoId!: string;

  @PrimaryColumn({ type: 'char', length: 7 })
  mes!: string;

  @Column({ type: 'integer', name: 'valor_inicial_centavos' })
  valorInicialCentavos!: number;

  @Column({ type: 'timestamptz', name: 'informada_em' })
  informadaEm!: Date;
}
