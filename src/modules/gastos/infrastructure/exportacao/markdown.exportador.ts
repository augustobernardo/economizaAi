import type {
  ArquivoExportado,
  DadosDoPeriodo,
  Exportador,
} from '../../application/ports/exportador.js';
import { ROTULOS_CATEGORIA } from '../../domain/categoria.js';
import { formatarDataBr } from '../../domain/data-civil.js';
import { ROTULOS_CATEGORIA_ENTRADA } from '../../domain/categoria-entrada.js';
import type { Gasto } from '../../domain/gasto.js';

/** Texto do usuário vira literal: sem quebrar a tabela nem virar link, imagem ou HTML. */
const celula = (texto: string) =>
  texto
    .replace(/\r?\n|\r/g, ' ')
    .replace(/[\\|[\]()<>!`*_~#@]/g, '\\$&')
    // autolink GFM: "https://" e "www." viram link; a barra invertida mantém o texto visível.
    .replace(/:(?=\/\/)/g, '\\:')
    .replace(/(?<![A-Za-z0-9])www\./gi, (m) => m.replace('.', '\\.'));

/** Dinheiro com sinal (`-R$ 30,00`), com espaço comum no lugar do NBSP do Intl. */
const moeda = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(centavos / 100)
    .replace(/\s/g, ' ');

/** Tabela GFM; seção sem linhas é omitida. */
const secao = (
  titulo: string,
  cabecalho: string[],
  linhas: string[][],
): string[] =>
  linhas.length === 0
    ? []
    : [
        `## ${titulo}`,
        '',
        `| ${cabecalho.join(' | ')} |`,
        `|${cabecalho.map(() => '---').join('|')}|`,
        ...linhas.map((l) => `| ${l.join(' | ')} |`),
        '',
      ];

export class MarkdownExportador implements Exportador {
  readonly formato = 'md' as const;

  gerar({
    periodo,
    resumo,
    gastos,
    entradas,
  }: DadosDoPeriodo): ArquivoExportado {
    const lancamento = (g: Gasto) => [
      formatarDataBr(g.dataGasto),
      celula(g.descricao),
      ROTULOS_CATEGORIA[g.categoria],
      g.valor.formatar(),
    ];
    const linhas = [
      `# Movimentações — ${periodo.descrever()}`,
      '',
      `**Entradas:** ${moeda(resumo.entradas.totalCentavos)} · ` +
        `**Gastos:** ${moeda(resumo.totalGastosCentavos)} · ` +
        `**Saldo:** ${moeda(resumo.saldoCentavos)}`,
      '',
      ...secao(
        'Por categoria',
        ['Categoria', 'Total', '%'],
        (resumo.compras?.porCategoria ?? []).map((c) => [
          ROTULOS_CATEGORIA[c.categoria],
          c.total.formatar(),
          `${c.percentual}%`,
        ]),
      ),
      ...secao(
        'Parcelamentos',
        ['Descrição', 'Parcela', 'Valor', 'Termina'],
        resumo.parcelas.itens.map((p) => [
          celula(p.parcelamento.descricao),
          `${p.numero}/${p.quantidade}`,
          p.valor.formatar(),
          p.terminaEm,
        ]),
      ),
      ...secao(
        'Entradas',
        ['Data', 'Descrição', 'Categoria', 'Valor'],
        entradas.map((e) => [
          formatarDataBr(e.dataEntrada),
          celula(e.descricao),
          ROTULOS_CATEGORIA_ENTRADA[e.categoria],
          e.valor.formatar(),
        ]),
      ),
      ...secao(
        'Faturas',
        [
          'Cartão',
          'Vencimento',
          'Inicial',
          'Compras',
          'Parcelas',
          'Reembolsos',
          'Total',
        ],
        resumo.faturas.map(({ cartaoNome, composicao: c }) => [
          celula(cartaoNome),
          formatarDataBr(c.vencimento),
          moeda(c.inicialCentavos),
          moeda(c.compras.centavos),
          moeda(c.parcelasCentavos),
          moeda(c.reembolsosCentavos),
          moeda(c.totalCentavos),
        ]),
      ),
      ...secao(
        'Lançamentos',
        ['Data', 'Descrição', 'Categoria', 'Valor'],
        gastos.map(lancamento),
      ),
    ];
    return {
      nomeArquivo: `economizaai-${periodo.slug}.md`,
      conteudo: Buffer.from(linhas.join('\n'), 'utf8'),
      mimeType: 'text/markdown; charset=utf-8',
      formato: this.formato,
    };
  }
}
