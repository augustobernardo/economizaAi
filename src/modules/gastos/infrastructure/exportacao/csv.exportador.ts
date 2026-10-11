import type {
  ArquivoExportado,
  DadosDoPeriodo,
  Exportador,
} from '../../application/ports/exportador.js';
import { formatarDataBr } from '../../domain/data-civil.js';
import type { Gasto } from '../../domain/gasto.js';
import { somarMeses } from '../../domain/mes.js';
import type { ParcelaNoPeriodo } from '../../domain/resumo-do-periodo.js';

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

interface Linha {
  tipo: 'gasto' | 'parcela' | 'entrada';
  data: string;
  descricao: string;
  categoria: string;
  centavos: number;
  origem: string;
  cartao: string;
  forma: string;
}

const ORDEM_TIPO = { gasto: 0, parcela: 1, entrada: 2 } as const;
const comparar = (a: Linha, b: Linha) =>
  a.data.localeCompare(b.data) ||
  ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] ||
  a.descricao.localeCompare(b.descricao, 'pt-BR');

/** `-3050` → `-30,50`, sem separador de milhar. */
const valorCsv = (centavos: number) =>
  (centavos / 100).toFixed(2).replace('.', ',');

const mesDaParcela = ({ parcelamento: p, numero }: ParcelaNoPeriodo) =>
  somarMeses(p.mesCompetenciaInicial, numero - p.parcelaInicial);

export class CsvExportador implements Exportador {
  readonly formato = 'csv' as const;

  gerar({
    periodo,
    resumo,
    gastos,
    entradas,
    cartoes,
  }: DadosDoPeriodo): ArquivoExportado {
    const nomeDoCartao = (id?: string) => (id && cartoes.get(id)?.nome) || '';
    const deGasto = (g: Gasto): Linha => ({
      tipo: 'gasto',
      data: g.dataGasto,
      descricao: g.descricao,
      categoria: g.categoria,
      centavos: -g.valor.centavos,
      origem: g.origem,
      cartao: nomeDoCartao(g.pagamento?.cartaoId),
      forma: g.pagamento?.forma ?? '',
    });
    const todas: Linha[] = [
      ...gastos.map(deGasto),
      ...resumo.parcelas.itens.map((p) => ({
        tipo: 'parcela' as const,
        // Parcela não tem dia: usa o dia 1 do mês de competência.
        data: `${mesDaParcela(p)}-01`,
        descricao: `${p.parcelamento.descricao} (${p.numero}/${p.quantidade})`,
        categoria: p.parcelamento.categoria,
        centavos: -p.valor.centavos,
        origem: p.parcelamento.origem,
        cartao: nomeDoCartao(p.parcelamento.cartaoId),
        forma: 'credito',
      })),
      ...entradas.map((e) => ({
        tipo: 'entrada' as const,
        data: e.dataEntrada,
        descricao: e.descricao,
        categoria: e.categoria,
        centavos: e.valor.centavos,
        origem: e.origem,
        cartao: nomeDoCartao(e.vinculo?.cartaoId),
        forma: '',
      })),
    ].sort(comparar);

    const linhas = [
      'tipo;data;descricao;categoria;valor;origem;cartao;forma',
      ...todas.map((l) =>
        [
          l.tipo,
          formatarDataBr(l.data),
          celulaCsv(l.descricao),
          l.categoria,
          valorCsv(l.centavos),
          l.origem,
          celulaCsv(l.cartao),
          l.forma,
        ].join(';'),
      ),
    ];
    return {
      nomeArquivo: `economizaai-${periodo.slug}.csv`,
      conteudo: Buffer.from(`${BOM}${linhas.join('\r\n')}\r\n`, 'utf8'),
      mimeType: 'text/csv; charset=utf-8',
      formato: this.formato,
    };
  }
}
