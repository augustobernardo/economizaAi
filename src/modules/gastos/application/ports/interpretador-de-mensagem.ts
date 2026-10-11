import type { FormaPagamento } from '../../domain/gasto.js';

export type EntradaMensagem =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'audio'; audio: Buffer; mimeType: string };

/** Nomes de exibição dos cartões cadastrados, para a IA reconhecer o que o usuário citou. */
export interface ContextoDeInterpretacao {
  cartoes: readonly string[];
}

export interface GastoExtraido {
  valorReais: number;
  categoria: string;
  descricao: string;
  dataGasto: string;
  cartao: string | null;
  formaPagamento: FormaPagamento | null;
}

export interface EntradaExtraida {
  valorReais: number;
  categoria: string;
  descricao: string;
  dataEntrada: string;
  cartao: string | null;
  mesFatura: string | null;
}

export interface ParcelamentoExtraido {
  descricao: string;
  categoria: string;
  cartao: string | null;
  totalReais: number | null;
  valorParcelaReais: number | null;
  quantidade: number;
  parcelaAtual: number | null;
  dataCompra: string;
}

export type Interpretacao =
  | {
      intencao: 'registrar';
      gastos: GastoExtraido[];
      entradas: EntradaExtraida[];
      parcelamentos: ParcelamentoExtraido[];
      textoOriginal: string;
    }
  | {
      intencao: 'exportar' | 'resumir';
      inicio: string;
      fim: string;
      textoOriginal: string;
    }
  | { intencao: 'listarUltimos'; textoOriginal: string }
  | {
      intencao: 'informarFatura';
      cartao: string | null;
      mes: string | null;
      valorReais: number;
      textoOriginal: string;
    }
  | {
      intencao: 'consultarFatura';
      cartao: string | null;
      mes: string | null;
      textoOriginal: string;
    };

/** Lançamento numerado da mensagem original, para a IA corrigir por índice. */
export type ItemParaCorrecao =
  | {
      tipo: 'gasto';
      indice: number;
      valorReais: number;
      categoria: string;
      descricao: string;
      data: string;
      cartao: string | null;
      formaPagamento: FormaPagamento | null;
    }
  | {
      tipo: 'entrada';
      indice: number;
      valorReais: number;
      categoria: string;
      descricao: string;
      data: string;
    };

export interface Correcao {
  alteracoes: {
    indice: number;
    valorReais?: number;
    categoria?: string;
    descricao?: string;
    data?: string;
    cartao?: string | null;
    formaPagamento?: FormaPagamento | null;
  }[];
  remover: number[];
  acrescentar: GastoExtraido[];
  textoOriginal: string;
}

export interface InterpretadorDeMensagem {
  interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
    contexto: ContextoDeInterpretacao,
  ): Promise<Interpretacao>;
  interpretarCorrecao(
    entrada: EntradaMensagem,
    itens: readonly ItemParaCorrecao[],
    dataReferencia: Date,
    contexto: ContextoDeInterpretacao,
  ): Promise<Correcao>;
}

export const INTERPRETADOR_DE_MENSAGEM = Symbol('INTERPRETADOR_DE_MENSAGEM');
