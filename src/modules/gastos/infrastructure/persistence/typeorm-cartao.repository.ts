import { Inject, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CartaoJaExisteError } from '../../application/errors.js';
import type { Cartao } from '../../domain/cartao.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import { paraDominio, paraPersistencia } from './cartao.mapper.js';
import { CartaoOrmEntity } from './cartao.orm-entity.js';

const VIOLACAO_UNIQUE = '23505';
const VIOLACAO_FK = '23503';

function codigoDoErro(erro: unknown): string | undefined {
  return erro instanceof QueryFailedError
    ? (erro.driverError as { code?: string }).code
    : undefined;
}

@Injectable()
export class TypeOrmCartaoRepository implements CartaoRepository {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async salvar(cartao: Cartao): Promise<void> {
    try {
      await this.dataSource
        .getRepository(CartaoOrmEntity)
        .insert(paraPersistencia(cartao));
    } catch (erro) {
      if (codigoDoErro(erro) === VIOLACAO_UNIQUE)
        throw new CartaoJaExisteError('Já existe um cartão com esse nome');
      throw erro;
    }
  }

  async listar(): Promise<Cartao[]> {
    const linhas = await this.dataSource
      .getRepository(CartaoOrmEntity)
      .find({ order: { nome: 'ASC', id: 'ASC' } });
    return linhas.map(paraDominio);
  }

  async buscarPorNome(nomeNormalizado: string): Promise<Cartao | null> {
    const linha = await this.dataSource
      .getRepository(CartaoOrmEntity)
      .findOneBy({ nomeNormalizado });
    return linha && paraDominio(linha);
  }

  async buscarPorId(id: string): Promise<Cartao | null> {
    const linha = await this.dataSource
      .getRepository(CartaoOrmEntity)
      .findOneBy({ id });
    return linha && paraDominio(linha);
  }

  async remover(id: string): Promise<'removido' | 'em-uso'> {
    try {
      await this.dataSource.getRepository(CartaoOrmEntity).delete({ id });
      return 'removido';
    } catch (erro) {
      if (codigoDoErro(erro) === VIOLACAO_FK) return 'em-uso';
      throw erro;
    }
  }
}
