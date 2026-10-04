import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';

export interface ArquivoExportado {
  nomeArquivo: string;
  conteudo: Buffer;
  mimeType: string;
  formato: 'csv' | 'md';
}

export interface Exportador {
  readonly formato: 'csv' | 'md';
  gerar(gastos: readonly Gasto[], periodo: Periodo): ArquivoExportado;
}

export const EXPORTADORES = Symbol('EXPORTADORES');
