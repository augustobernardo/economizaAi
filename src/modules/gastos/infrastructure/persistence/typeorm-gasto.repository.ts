import { Inject, Injectable } from '@nestjs/common';
import { And, DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import type { Gasto } from '../../domain/gasto.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import { GastoOrmEntity } from './gasto.orm-entity.js';
import { paraDominio, paraPersistencia } from './gasto.mapper.js';

@Injectable()
export class TypeOrmGastoRepository implements GastoRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async salvarVarios(gastos: Gasto[]): Promise<void> {
    if (gastos.length === 0) return;
    const linhas = gastos.map(paraPersistencia);
    await this.dataSource.transaction((m) => m.insert(GastoOrmEntity, linhas));
  }

  async removerDoRegistro(
    registroId: string,
    criadoDesde: Date,
  ): Promise<number> {
    const resultado = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(GastoOrmEntity)
      .where('registro_id = :registroId', { registroId })
      .andWhere('criado_em >= :criadoDesde', { criadoDesde })
      .execute();
    return resultado.affected ?? 0;
  }

  async listarPorPeriodo(
    inicio: string,
    fimExclusivo: string,
  ): Promise<Gasto[]> {
    const linhas = await this.dataSource.getRepository(GastoOrmEntity).find({
      where: {
        dataGasto: And(MoreThanOrEqual(inicio), LessThan(fimExclusivo)),
      },
      order: { dataGasto: 'ASC', criadoEm: 'ASC' },
    });
    return linhas.map(paraDominio);
  }

  async listarUltimos(limite: number): Promise<Gasto[]> {
    const linhas = await this.dataSource.getRepository(GastoOrmEntity).find({
      order: { criadoEm: 'DESC', id: 'DESC' },
      take: limite,
    });
    return linhas.map(paraDominio);
  }
}
