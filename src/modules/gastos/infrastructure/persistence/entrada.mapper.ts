import type { CategoriaEntrada } from '../../domain/categoria-entrada.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Entrada } from '../../domain/entrada.js';
import type { OrigemGasto } from '../../domain/gasto.js';
import { EntradaOrmEntity } from './entrada.orm-entity.js';

export function paraDominio(linha: EntradaOrmEntity): Entrada {
  return Entrada.restaurar({
    id: linha.id,
    valor: Dinheiro.deCentavos(linha.valorCentavos),
    // O CHECK do banco garante os valores fechados.
    categoria: linha.categoria as CategoriaEntrada,
    descricao: linha.descricao,
    dataEntrada: linha.dataEntrada,
    origem: linha.origem as OrigemGasto,
    textoOriginal: linha.textoOriginal,
    registroId: linha.registroId,
    criadoEm: linha.criadoEm,
    editadoEm: linha.editadoEm,
    // O CHECK `ck_entradas_vinculo` garante os dois campos juntos.
    vinculo:
      linha.cartaoId === null || linha.mesFatura === null
        ? null
        : { cartaoId: linha.cartaoId, mesFatura: linha.mesFatura },
  });
}

export function paraPersistencia(entrada: Entrada): EntradaOrmEntity {
  const linha = new EntradaOrmEntity();
  linha.id = entrada.id;
  linha.valorCentavos = entrada.valor.centavos;
  linha.categoria = entrada.categoria;
  linha.descricao = entrada.descricao;
  linha.dataEntrada = entrada.dataEntrada;
  linha.origem = entrada.origem;
  linha.textoOriginal = entrada.textoOriginal;
  linha.registroId = entrada.registroId;
  linha.criadoEm = entrada.criadoEm;
  linha.editadoEm = entrada.editadoEm;
  linha.cartaoId = entrada.vinculo?.cartaoId ?? null;
  linha.mesFatura = entrada.vinculo?.mesFatura ?? null;
  return linha;
}
