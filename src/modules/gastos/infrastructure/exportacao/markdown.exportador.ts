import type {
  ArquivoExportado,
  Exportador,
} from '../../application/ports/exportador.js';
import { ROTULOS_CATEGORIA } from '../../domain/categoria.js';
import { formatarDataBr } from '../../domain/data-civil.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';
import { formatarPercentual, plural, resumir } from '../../domain/resumo.js';

/** Texto do usuário vira literal: sem quebrar a tabela nem virar link, imagem ou HTML. */
const celula = (texto: string) =>
  texto.replace(/\r?\n|\r/g, ' ').replace(/[\\|[\]()<>!`]/g, '\\$&');

export class MarkdownExportador implements Exportador {
  readonly formato = 'md' as const;

  gerar(gastos: readonly Gasto[], periodo: Periodo): ArquivoExportado {
    const r = resumir(gastos);
    const maior = r.maiorGasto;
    const linhas = [
      `# Gastos — ${periodo.descrever()}`,
      '',
      `**Total:** ${r.total.formatar()} (${plural(r.quantidade, 'gasto', 'gastos')})`,
      '',
      '## Por categoria',
      '',
      '| Categoria | Total | % |',
      '|---|---|---|',
      ...r.porCategoria.map((c) => {
        const nome = ROTULOS_CATEGORIA[c.categoria];
        return `| ${nome} | ${c.total.formatar()} | ${formatarPercentual(c.percentual)} |`;
      }),
      '',
      `**Maior gasto:** ${celula(maior.descricao)} — ${maior.valor.formatar()}` +
        ` (${formatarDataBr(maior.dataGasto)})`,
      '',
      '## Lançamentos',
      '',
      '| Data | Descrição | Categoria | Valor |',
      '|---|---|---|---|',
      ...gastos.map((g) => {
        const data = formatarDataBr(g.dataGasto);
        const nome = ROTULOS_CATEGORIA[g.categoria];
        return `| ${data} | ${celula(g.descricao)} | ${nome} | ${g.valor.formatar()} |`;
      }),
      '',
    ];
    return {
      nomeArquivo: `economizaai-${periodo.slug}.md`,
      conteudo: Buffer.from(linhas.join('\n'), 'utf8'),
      mimeType: 'text/markdown; charset=utf-8',
      formato: this.formato,
    };
  }
}
