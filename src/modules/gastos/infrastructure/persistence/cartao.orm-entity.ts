import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Linha da tabela `cartoes`. Nunca sai de `infrastructure/persistence/`; use o mapper. */
@Entity('cartoes')
export class CartaoOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  nome!: string;

  @Column({ type: 'varchar', length: 120, name: 'nome_normalizado' })
  nomeNormalizado!: string;

  @Column({ type: 'smallint', name: 'dia_fechamento' })
  diaFechamento!: number;

  @Column({ type: 'smallint', name: 'dia_vencimento' })
  diaVencimento!: number;

  @Column({ type: 'timestamptz', name: 'criado_em' })
  criadoEm!: Date;
}
