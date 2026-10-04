export type EntradaMensagem =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'audio'; audio: Buffer; mimeType: string };

export interface GastoExtraido {
  valorReais: number;
  categoria: string;
  descricao: string;
  dataGasto: string;
}

export type Interpretacao =
  | { intencao: 'registrar'; gastos: GastoExtraido[]; textoOriginal: string }
  | {
      intencao: 'exportar' | 'resumir';
      inicio: string;
      fim: string;
      textoOriginal: string;
    }
  | { intencao: 'listarUltimos'; textoOriginal: string };

export interface InterpretadorDeMensagem {
  interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
  ): Promise<Interpretacao>;
}

export const INTERPRETADOR_DE_MENSAGEM = Symbol('INTERPRETADOR_DE_MENSAGEM');
