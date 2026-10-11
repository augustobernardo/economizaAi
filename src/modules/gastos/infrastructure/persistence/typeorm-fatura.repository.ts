import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { FaturaInformada } from '../../domain/fatura.js';
import type { FaturaRepository } from '../../domain/ports/fatura.repository.js';
import { paraDominio, paraPersistencia } from './fatura.mapper.js';
import { FaturaOrmEntity } from './fatura.orm-entity.js';

@Injectable()
export class TypeOrmFaturaRepository implements FaturaRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async salvar(fatura: FaturaInformada): Promise<FaturaInformada | null> {
    // ponytail: lock não cobre a 1ª gravação concorrente; uso de um único dono.
    return this.dataSource.transaction(async (m) => {
      const anterior = await m.findOne(FaturaOrmEntity, {
        where: { cartaoId: fatura.cartaoId, mes: fatura.mes },
        lock: { mode: 'pessimistic_write' },
      });
      await m.upsert(FaturaOrmEntity, paraPersistencia(fatura), [
        'cartaoId',
        'mes',
      ]);
      return anterior && paraDominio(anterior);
    });
  }

  async buscar(cartaoId: string, mes: string): Promise<FaturaInformada | null> {
    const linha = await this.dataSource
      .getRepository(FaturaOrmEntity)
      .findOneBy({ cartaoId, mes });
    return linha && paraDominio(linha);
  }
}
