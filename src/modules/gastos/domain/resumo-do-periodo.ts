import type { CategoriaEntrada } from './categoria-entrada.js';
import type { Dinheiro } from './dinheiro.js';
import type { Entrada } from './entrada.js';
import type { ComposicaoDaFatura } from './fatura.js';
import type { Gasto } from './gasto.js';
import type { Parcelamento } from './parcelamento.js';
import { resumir, type ResumoDeGastos } from './resumo.js';

export interface ParcelaNoPeriodo {
  parcelamento: Parcelamento;
  numero: number;
  quantidade: number;
  valor: Dinheiro;
  restantes: number;
  /** Mês de competência da última parcela, `AAAA-MM`. */
  terminaEm: string;
}

export interface ResumoDoPeriodo {
  entradas: {
    quantidade: number;
    totalCentavos: number;
    porCategoria: { categoria: CategoriaEntrada; totalCentavos: number }[];
  };
  /** Só gastos avulsos; as parcelas ficam em `parcelas`. */
  compras: ResumoDeGastos | null;
  parcelas: { itens: ParcelaNoPeriodo[]; totalCentavos: number };
  /** Compras + parcelas. */
  totalGastosCentavos: number;
  /** Entradas − gastos; negativo quando gastou mais do que entrou. */
  saldoCentavos: number;
  faturas: { cartaoNome: string; composicao: ComposicaoDaFatura }[];
}

export interface EntradaDoResumoDoPeriodo {
  /** Meses de competência tocados pelo período, `AAAA-MM`. */
  meses: string[];
  gastos: readonly Gasto[];
  entradas: readonly Entrada[];
  parcelamentos: readonly Parcelamento[];
  faturas: { cartaoNome: string; composicao: ComposicaoDaFatura }[];
}

const soma = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

function parcelasDoPeriodo(
  parcelamentos: readonly Parcelamento[],
  meses: readonly string[],
): ParcelaNoPeriodo[] {
  const itens = parcelamentos.flatMap((parcelamento) =>
    meses.flatMap((mes) => {
      const parcela = parcelamento.parcelaNoMes(mes);
      return parcela
        ? [
            {
              parcelamento,
              ...parcela,
              restantes: parcelamento.restantesApos(parcela.numero),
              terminaEm: parcelamento.ultimoMesCompetencia,
            },
          ]
        : [];
    }),
  );
  return itens.sort(
    (a, b) =>
      a.restantes - b.restantes ||
      a.parcelamento.descricao.localeCompare(b.parcelamento.descricao) ||
      a.numero - b.numero,
  );
}

function entradasDoPeriodo(
  entradas: readonly Entrada[],
): ResumoDoPeriodo['entradas'] {
  const porCategoria = new Map<CategoriaEntrada, number>();
  for (const e of entradas) {
    porCategoria.set(
      e.categoria,
      (porCategoria.get(e.categoria) ?? 0) + e.valor.centavos,
    );
  }
  return {
    quantidade: entradas.length,
    totalCentavos: soma(entradas.map((e) => e.valor.centavos)),
    porCategoria: [...porCategoria]
      .map(([categoria, totalCentavos]) => ({ categoria, totalCentavos }))
      .sort(
        (a, b) =>
          b.totalCentavos - a.totalCentavos ||
          a.categoria.localeCompare(b.categoria),
      ),
  };
}

/** Resume o período; `null` quando não há gasto, entrada, parcela nem fatura. */
export function resumirPeriodo(
  e: EntradaDoResumoDoPeriodo,
): ResumoDoPeriodo | null {
  const itens = parcelasDoPeriodo(e.parcelamentos, [...new Set(e.meses)]);
  if (
    !e.gastos.length &&
    !e.entradas.length &&
    !itens.length &&
    !e.faturas.length
  )
    return null;

  const compras = e.gastos.length ? resumir(e.gastos) : null;
  const parcelasCentavos = soma(itens.map((i) => i.valor.centavos));
  const entradas = entradasDoPeriodo(e.entradas);
  const totalGastosCentavos = (compras?.total.centavos ?? 0) + parcelasCentavos;

  return {
    entradas,
    compras,
    parcelas: { itens, totalCentavos: parcelasCentavos },
    totalGastosCentavos,
    saldoCentavos: entradas.totalCentavos - totalGastosCentavos,
    faturas: e.faturas,
  };
}
