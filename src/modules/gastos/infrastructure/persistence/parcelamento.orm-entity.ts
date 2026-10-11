import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Linha da tabela `parcelamentos`. Nunca sai de `infrastructure/persistence/`; use o mapper. */
@Entity('parcelamentos')
export class ParcelamentoOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', name: 'cartao_id' })
  cartaoId!: string;

  @Column({ type: 'varchar', length: 200 })
  descricao!: string;

  @Column({ type: 'varchar', length: 20 })
  categoria!: string;

  @Column({ type: 'integer', name: 'valor_parcela_centavos' })
  valorParcelaCentavos!: number;

  @Column({ type: 'integer', name: 'primeira_parcela_centavos' })
  primeiraParcelaCentavos!: number;

  @Column({ type: 'smallint' })
  quantidade!: number;

  @Column({ type: 'smallint', name: 'parcela_inicial' })
  parcelaInicial!: number;

  /** `date` volta como string `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'data_compra' })
  dataCompra!: string;

  @Column({ type: 'char', length: 7, name: 'mes_competencia_inicial' })
  mesCompetenciaInicial!: string;

  @Column({ type: 'char', length: 7, name: 'mes_fatura_inicial' })
  mesFaturaInicial!: string;

  @Column({ type: 'varchar', length: 10 })
  origem!: string;

  @Column({ type: 'text', name: 'texto_original' })
  textoOriginal!: string;

  @Column({ type: 'uuid', name: 'registro_id' })
  registroId!: string;

  @Column({ type: 'timestamptz', name: 'criado_em' })
  criadoEm!: Date;
}
