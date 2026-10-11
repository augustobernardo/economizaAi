import type {
  ContextoDeInterpretacao,
  Correcao,
  EntradaMensagem,
  Interpretacao,
  InterpretadorDeMensagem,
  ItemParaCorrecao,
} from '../../src/modules/gastos/application/ports/interpretador-de-mensagem.js';

export class FakeInterpretador implements InterpretadorDeMensagem {
  readonly chamadas: {
    entrada: EntradaMensagem;
    dataReferencia: Date;
    contexto: ContextoDeInterpretacao;
  }[] = [];
  readonly correcoes: {
    entrada: EntradaMensagem;
    itens: readonly ItemParaCorrecao[];
    contexto: ContextoDeInterpretacao;
  }[] = [];

  constructor(
    private readonly resposta: Interpretacao | Error,
    private readonly correcao: Correcao | Error = new Error(
      'correção não configurada',
    ),
  ) {}

  async interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
    contexto: ContextoDeInterpretacao = { cartoes: [] },
  ): Promise<Interpretacao> {
    this.chamadas.push({ entrada, dataReferencia, contexto });
    if (this.resposta instanceof Error) throw this.resposta;
    return this.resposta;
  }

  async interpretarCorrecao(
    entrada: EntradaMensagem,
    itens: readonly ItemParaCorrecao[],
    _dataReferencia: Date,
    contexto: ContextoDeInterpretacao,
  ): Promise<Correcao> {
    this.correcoes.push({ entrada, itens, contexto });
    if (this.correcao instanceof Error) throw this.correcao;
    return this.correcao;
  }
}
