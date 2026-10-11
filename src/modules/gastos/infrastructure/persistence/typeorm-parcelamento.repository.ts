import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Parcelamento } from '../../domain/parcelamento.js';
import type { ParcelamentoRepository } from '../../domain/ports/parcelamento.repository.js';
import { paraDominio } from './parcelamento.mapper.js';
import { ParcelamentoOrmEntity } from './parcelamento.orm-entity.js';

@Injectable()
export class TypeOrmParcelamentoRepository implements ParcelamentoRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  // ponytail: sem filtro no SQL; query por intervalo de meses se passar de centenas.
  async listarTodos(): Promise<Parcelamento[]> {
    const linhas = await this.dataSource
      .getRepository(ParcelamentoOrmEntity)
      .find({ order: { criadoEm: 'ASC', id: 'ASC' } });
    return linhas.map(paraDominio);
  }

  async buscarPorId(id: string): Promise<Parcelamento | null> {
    const linha = await this.dataSource
      .getRepository(ParcelamentoOrmEntity)
      .findOneBy({ id });
    return linha && paraDominio(linha);
  }

  async remover(id: string): Promise<boolean> {
    const r = await this.dataSource
      .getRepository(ParcelamentoOrmEntity)
      .delete({ id });
    return (r.affected ?? 0) > 0;
  }
}
