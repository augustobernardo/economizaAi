import type {
  ArquivoExportado,
  Exportador,
} from '../../src/modules/gastos/application/ports/exportador.js';
import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { Periodo } from '../../src/modules/gastos/domain/periodo.js';

export class FakeExportador implements Exportador {
  readonly chamadas: { gastos: readonly Gasto[]; periodo: Periodo }[] = [];

  constructor(readonly formato: 'csv' | 'md') {}

  gerar(gastos: readonly Gasto[], periodo: Periodo): ArquivoExportado {
    this.chamadas.push({ gastos, periodo });
    return {
      nomeArquivo: `fake-${periodo.slug}.${this.formato}`,
      conteudo: Buffer.from(String(gastos.length)),
      mimeType: 'text/plain',
    };
  }
}
