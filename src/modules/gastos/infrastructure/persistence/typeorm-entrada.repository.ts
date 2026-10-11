import { Inject, Injectable } from '@nestjs/common';
import { And, DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import type { Entrada } from '../../domain/entrada.js';
import type { EntradaRepository } from '../../domain/ports/entrada.repository.js';
import { paraDominio } from './entrada.mapper.js';
import { EntradaOrmEntity } from './entrada.orm-entity.js';

@Injectable()
export class TypeOrmEntradaRepository implements EntradaRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async listarPorPeriodo(
    inicio: string,
    fimExclusivo: string,
  ): Promise<Entrada[]> {
    const linhas = await this.dataSource.getRepository(EntradaOrmEntity).find({
      where: {
        dataEntrada: And(MoreThanOrEqual(inicio), LessThan(fimExclusivo)),
      },
      order: { dataEntrada: 'ASC', criadoEm: 'ASC' },
    });
    return linhas.map(paraDominio);
  }

  async listarReembolsosDaFatura(
    cartaoId: string,
    mesFatura: string,
  ): Promise<Entrada[]> {
    const linhas = await this.dataSource.getRepository(EntradaOrmEntity).find({
      where: { cartaoId, mesFatura },
      order: { criadoEm: 'ASC', id: 'ASC' },
    });
    return linhas.map(paraDominio);
  }
}
