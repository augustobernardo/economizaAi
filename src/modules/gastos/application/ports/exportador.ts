import type { Cartao } from '../../domain/cartao.js';
import type { Entrada } from '../../domain/entrada.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';
import type { ResumoDoPeriodo } from '../../domain/resumo-do-periodo.js';

export interface ArquivoExportado {
  nomeArquivo: string;
  conteudo: Buffer;
  mimeType: string;
  formato: 'csv' | 'md';
}

/** Tudo o que um exportador precisa do período, já carregado e resumido. */
export interface DadosDoPeriodo {
  periodo: Periodo;
  resumo: ResumoDoPeriodo;
  gastos: readonly Gasto[];
  entradas: readonly Entrada[];
  cartoes: ReadonlyMap<string, Cartao>;
}

export interface Exportador {
  readonly formato: 'csv' | 'md';
  gerar(dados: DadosDoPeriodo): ArquivoExportado;
}

export const EXPORTADORES = Symbol('EXPORTADORES');
