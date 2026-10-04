import type {
  ArquivoExportado,
  Exportador,
} from '../../application/ports/exportador.js';
import { formatarDataBr } from '../../domain/data-civil.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';

const BOM = '﻿';
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
const PRECISA_DE_ASPAS = /[;"\r\n]/;

/** Neutraliza fórmulas (SECURITY.md §3.7) e aplica o quoting do CSV. */
export function celulaCsv(valor: string): string {
  const seguro = INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor;
  return PRECISA_DE_ASPAS.test(seguro)
    ? `"${seguro.replaceAll('"', '""')}"`
    : seguro;
}

export class CsvExportador implements Exportador {
  readonly formato = 'csv';

  gerar(gastos: readonly Gasto[], periodo: Periodo): ArquivoExportado {
    const linhas = [
      'data;descricao;categoria;valor;origem',
      ...gastos.map((g) =>
        [
          formatarDataBr(g.dataGasto),
          celulaCsv(g.descricao),
          g.categoria,
          (g.valor.centavos / 100).toFixed(2).replace('.', ','),
          g.origem,
        ].join(';'),
      ),
    ];
    return {
      nomeArquivo: `economizaai-${periodo.slug}.csv`,
      conteudo: Buffer.from(`${BOM}${linhas.join('\r\n')}\r\n`, 'utf8'),
      mimeType: 'text/csv; charset=utf-8',
    };
  }
}
