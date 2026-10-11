import type {
  ArquivoExportado,
  DadosDoPeriodo,
  Exportador,
} from '../../src/modules/gastos/application/ports/exportador.js';

export class FakeExportador implements Exportador {
  readonly chamadas: DadosDoPeriodo[] = [];

  constructor(readonly formato: 'csv' | 'md') {}

  gerar(dados: DadosDoPeriodo): ArquivoExportado {
    this.chamadas.push(dados);
    return {
      nomeArquivo: `fake-${dados.periodo.slug}.${this.formato}`,
      conteudo: Buffer.from(String(dados.gastos.length)),
      mimeType: 'text/plain',
      formato: this.formato,
    };
  }
}
