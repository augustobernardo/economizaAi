import type {
  EntradaMensagem,
  Interpretacao,
  InterpretadorDeMensagem,
} from '../../src/modules/gastos/application/ports/interpretador-de-mensagem.js';

export class FakeInterpretador implements InterpretadorDeMensagem {
  readonly chamadas: { entrada: EntradaMensagem; dataReferencia: Date }[] = [];

  constructor(private readonly resposta: Interpretacao | Error) {}

  async interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
  ): Promise<Interpretacao> {
    this.chamadas.push({ entrada, dataReferencia });
    if (this.resposta instanceof Error) throw this.resposta;
    return this.resposta;
  }
}
