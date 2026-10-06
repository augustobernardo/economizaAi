export type EntradaExtracao =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'audio'; audio: Buffer; mimeType: string };

/** Gasto bruto devolvido pela IA, ainda não validado pelo domínio. */
export interface GastoExtraido {
  valorReais: number;
  categoria: string;
  descricao: string;
  dataGasto: string;
}

export interface ResultadoExtracao {
  gastos: GastoExtraido[];
  textoOriginal: string;
}

export interface ExtratorDeGastos {
  extrair(
    entrada: EntradaExtracao,
    dataReferencia: Date,
  ): Promise<ResultadoExtracao>;
}

export const EXTRATOR_DE_GASTOS = Symbol('EXTRATOR_DE_GASTOS');
