import { Cartao } from '../../domain/cartao.js';
import { CartaoOrmEntity } from './cartao.orm-entity.js';

export function paraDominio(linha: CartaoOrmEntity): Cartao {
  return Cartao.restaurar({
    id: linha.id,
    nome: linha.nome,
    diaFechamento: linha.diaFechamento,
    diaVencimento: linha.diaVencimento,
    criadoEm: linha.criadoEm,
  });
}

export function paraPersistencia(cartao: Cartao): CartaoOrmEntity {
  const linha = new CartaoOrmEntity();
  linha.id = cartao.id;
  linha.nome = cartao.nome;
  linha.nomeNormalizado = cartao.nomeNormalizado;
  linha.diaFechamento = cartao.diaFechamento;
  linha.diaVencimento = cartao.diaVencimento;
  linha.criadoEm = cartao.criadoEm;
  return linha;
}
