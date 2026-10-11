import type { Categoria } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import type { OrigemGasto } from '../../domain/gasto.js';
import { Parcelamento } from '../../domain/parcelamento.js';
import { ParcelamentoOrmEntity } from './parcelamento.orm-entity.js';

export function paraDominio(linha: ParcelamentoOrmEntity): Parcelamento {
  return Parcelamento.restaurar({
    id: linha.id,
    cartaoId: linha.cartaoId,
    descricao: linha.descricao,
    // O CHECK do banco garante os valores fechados.
    categoria: linha.categoria as Categoria,
    valorParcela: Dinheiro.deCentavos(linha.valorParcelaCentavos),
    primeiraParcela: Dinheiro.deCentavos(linha.primeiraParcelaCentavos),
    quantidade: linha.quantidade,
    parcelaInicial: linha.parcelaInicial,
    dataCompra: linha.dataCompra,
    mesCompetenciaInicial: linha.mesCompetenciaInicial,
    mesFaturaInicial: linha.mesFaturaInicial,
    origem: linha.origem as OrigemGasto,
    textoOriginal: linha.textoOriginal,
    registroId: linha.registroId,
    criadoEm: linha.criadoEm,
  });
}

export function paraPersistencia(p: Parcelamento): ParcelamentoOrmEntity {
  const linha = new ParcelamentoOrmEntity();
  linha.id = p.id;
  linha.cartaoId = p.cartaoId;
  linha.descricao = p.descricao;
  linha.categoria = p.categoria;
  linha.valorParcelaCentavos = p.valorParcela.centavos;
  linha.primeiraParcelaCentavos = p.primeiraParcela.centavos;
  linha.quantidade = p.quantidade;
  linha.parcelaInicial = p.parcelaInicial;
  linha.dataCompra = p.dataCompra;
  linha.mesCompetenciaInicial = p.mesCompetenciaInicial;
  linha.mesFaturaInicial = p.mesFaturaInicial;
  linha.origem = p.origem;
  linha.textoOriginal = p.textoOriginal;
  linha.registroId = p.registroId;
  linha.criadoEm = p.criadoEm;
  return linha;
}
