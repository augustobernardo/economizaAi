import type { Categoria } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import type { OrigemGasto } from '../../domain/gasto.js';
import { Gasto } from '../../domain/gasto.js';
import { GastoOrmEntity } from './gasto.orm-entity.js';

export function paraDominio(linha: GastoOrmEntity): Gasto {
  return Gasto.restaurar({
    id: linha.id,
    valor: Dinheiro.deCentavos(linha.valorCentavos),
    // O CHECK do banco garante os valores fechados.
    categoria: linha.categoria as Categoria,
    descricao: linha.descricao,
    dataGasto: linha.dataGasto,
    origem: linha.origem as OrigemGasto,
    textoOriginal: linha.textoOriginal,
    criadoEm: linha.criadoEm,
    registroId: linha.registroId,
  });
}

export function paraPersistencia(gasto: Gasto): GastoOrmEntity {
  const linha = new GastoOrmEntity();
  linha.id = gasto.id;
  linha.valorCentavos = gasto.valor.centavos;
  linha.categoria = gasto.categoria;
  linha.descricao = gasto.descricao;
  linha.dataGasto = gasto.dataGasto;
  linha.origem = gasto.origem;
  linha.textoOriginal = gasto.textoOriginal;
  linha.criadoEm = gasto.criadoEm;
  linha.registroId = gasto.registroId;
  return linha;
}
