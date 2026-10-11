import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import {
  CartaoNaoEncontradoError,
  RegistroAlteradoError,
} from '../../application/errors.js';
import { Entrada } from '../../domain/entrada.js';
import { Gasto } from '../../domain/gasto.js';
import type {
  ItensDoRegistro,
  RegistroRepository,
} from '../../domain/ports/registro.repository.js';
import {
  paraPersistencia as entradaParaLinha,
  paraDominio as linhaParaEntrada,
} from './entrada.mapper.js';
import { EntradaOrmEntity } from './entrada.orm-entity.js';
import {
  paraPersistencia as gastoParaLinha,
  paraDominio as linhaParaGasto,
} from './gasto.mapper.js';
import { GastoOrmEntity } from './gasto.orm-entity.js';
import {
  paraPersistencia as parcelamentoParaLinha,
  paraDominio as linhaParaParcelamento,
} from './parcelamento.mapper.js';
import { ParcelamentoOrmEntity } from './parcelamento.orm-entity.js';

type Item = Gasto | Entrada;

const VIOLACAO_FK = '23503';

/** FK de cartão violada vira erro de aplicação; o resto sobe cru. */
async function comFkTraduzida<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (
      erro instanceof QueryFailedError &&
      (erro.driverError as { code?: string }).code === VIOLACAO_FK
    )
      throw new CartaoNaoEncontradoError('Cartão não encontrado');
    throw erro;
  }
}

/** Exige exatamente uma linha afetada: senão a edição mirou algo que sumiu. */
function exigirUma(affected: number | null | undefined): void {
  if (affected !== 1)
    throw new RegistroAlteradoError('Registro alterado ou apagado');
}

/** Todas as operações abrem uma transação: qualquer falha desfaz tudo. */
@Injectable()
export class TypeOrmRegistroRepository implements RegistroRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async salvar(itens: ItensDoRegistro): Promise<void> {
    await comFkTraduzida(() =>
      this.dataSource.transaction(async (m) => {
        // Parcelamentos por último: são a violação de CHECK mais provável.
        await this.inserirGastos(m, itens.gastos);
        await this.inserirEntradas(m, itens.entradas);
        if (itens.parcelamentos.length > 0)
          await m.insert(
            ParcelamentoOrmEntity,
            itens.parcelamentos.map(parcelamentoParaLinha),
          );
      }),
    );
  }

  async desfazer(registroId: string, criadoDesde: Date): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      let total = 0;
      for (const entidade of [
        GastoOrmEntity,
        EntradaOrmEntity,
        ParcelamentoOrmEntity,
      ]) {
        const r = await m
          .createQueryBuilder()
          .delete()
          .from(entidade)
          .where('registro_id = :registroId', { registroId })
          .andWhere('criado_em >= :criadoDesde', { criadoDesde })
          .execute();
        total += r.affected ?? 0;
      }
      return total;
    });
  }

  async carregar(registroId: string): Promise<ItensDoRegistro> {
    const order = { criadoEm: 'ASC', id: 'ASC' } as const;
    // REPEATABLE READ: as três leituras enxergam o mesmo instante.
    return this.dataSource.transaction('REPEATABLE READ', async (m) => {
      const gastos = await m.find(GastoOrmEntity, {
        where: { registroId },
        order,
      });
      const entradas = await m.find(EntradaOrmEntity, {
        where: { registroId },
        order,
      });
      const parcelamentos = await m.find(ParcelamentoOrmEntity, {
        where: { registroId },
        order,
      });
      return {
        gastos: gastos.map(linhaParaGasto),
        entradas: entradas.map(linhaParaEntrada),
        parcelamentos: parcelamentos.map(linhaParaParcelamento),
      };
    });
  }

  async aplicarEdicao(e: {
    atualizar: Item[];
    remover: Item[];
    inserir: Item[];
  }): Promise<void> {
    await comFkTraduzida(() =>
      this.dataSource.transaction(async (m) => {
        for (const item of e.remover) {
          const r = await m.delete(
            item instanceof Gasto ? GastoOrmEntity : EntradaOrmEntity,
            { id: item.id },
          );
          exigirUma(r.affected);
        }
        for (const item of e.atualizar) {
          const r =
            item instanceof Gasto
              ? await m.update(
                  GastoOrmEntity,
                  { id: item.id },
                  gastoParaLinha(item),
                )
              : await m.update(
                  EntradaOrmEntity,
                  { id: item.id },
                  entradaParaLinha(item),
                );
          exigirUma(r.affected);
        }
        await this.inserirGastos(
          m,
          e.inserir.filter((i) => i instanceof Gasto),
        );
        await this.inserirEntradas(
          m,
          e.inserir.filter((i) => i instanceof Entrada),
        );
      }),
    );
  }

  private async inserirGastos(
    m: EntityManager,
    gastos: Gasto[],
  ): Promise<void> {
    if (gastos.length > 0)
      await m.insert(GastoOrmEntity, gastos.map(gastoParaLinha));
  }

  private async inserirEntradas(
    m: EntityManager,
    entradas: Entrada[],
  ): Promise<void> {
    if (entradas.length > 0)
      await m.insert(EntradaOrmEntity, entradas.map(entradaParaLinha));
  }
}
