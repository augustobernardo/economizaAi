import type {
  EntradaExtracao,
  ExtratorDeGastos,
  ResultadoExtracao,
} from '../../src/modules/gastos/application/ports/extrator-de-gastos.js';

export class FakeExtrator implements ExtratorDeGastos {
  readonly chamadas: { entrada: EntradaExtracao; dataReferencia: Date }[] = [];

  constructor(private readonly resposta: ResultadoExtracao | Error) {}

  async extrair(
    entrada: EntradaExtracao,
    dataReferencia: Date,
  ): Promise<ResultadoExtracao> {
    this.chamadas.push({ entrada, dataReferencia });
    if (this.resposta instanceof Error) throw this.resposta;
    return this.resposta;
  }
}
