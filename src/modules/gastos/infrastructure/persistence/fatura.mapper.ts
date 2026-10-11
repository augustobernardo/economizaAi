import { FaturaInformada } from '../../domain/fatura.js';
import { FaturaOrmEntity } from './fatura.orm-entity.js';

export function paraDominio(linha: FaturaOrmEntity): FaturaInformada {
  return FaturaInformada.restaurar({
    cartaoId: linha.cartaoId,
    mes: linha.mes,
    valorInicial: linha.valorInicialCentavos,
    informadaEm: linha.informadaEm,
  });
}

export function paraPersistencia(fatura: FaturaInformada): FaturaOrmEntity {
  const linha = new FaturaOrmEntity();
  linha.cartaoId = fatura.cartaoId;
  linha.mes = fatura.mes;
  linha.valorInicialCentavos = fatura.valorInicial;
  linha.informadaEm = fatura.informadaEm;
  return linha;
}
