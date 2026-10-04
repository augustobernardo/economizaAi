import type { Categoria } from './categoria.js';
import { Dinheiro } from './dinheiro.js';
import type { Gasto } from './gasto.js';

export interface TotalPorCategoria {
  categoria: Categoria;
  total: Dinheiro;
  /** Participação no total, com uma casa decimal. */
  percentual: number;
}

export interface ResumoDeGastos {
  quantidade: number;
  total: Dinheiro;
  porCategoria: TotalPorCategoria[];
  maiorGasto: Gasto;
}

export const plural = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

/** `50` → `50%`, `33.3` → `33,3%`. */
export const formatarPercentual = (n: number): string =>
  `${String(n).replace('.', ',')}%`;

/** Resume uma lista não vazia de gastos; lista vazia é erro de programação. */
export function resumir(gastos: readonly Gasto[]): ResumoDeGastos {
  const [primeiro] = gastos;
  if (!primeiro) throw new RangeError('resumir exige ao menos um gasto');

  const porCategoria = new Map<Categoria, number>();
  let totalCentavos = 0;
  let maiorGasto = primeiro;
  for (const gasto of gastos) {
    totalCentavos += gasto.valor.centavos;
    porCategoria.set(
      gasto.categoria,
      (porCategoria.get(gasto.categoria) ?? 0) + gasto.valor.centavos,
    );
    if (gasto.valor.centavos > maiorGasto.valor.centavos) maiorGasto = gasto;
  }

  return {
    quantidade: gastos.length,
    total: Dinheiro.deCentavos(totalCentavos),
    porCategoria: [...porCategoria]
      .sort(([catA, a], [catB, b]) => b - a || catA.localeCompare(catB))
      .map(([categoria, centavos]) => ({
        categoria,
        total: Dinheiro.deCentavos(centavos),
        percentual: Math.round((centavos * 1000) / totalCentavos) / 10,
      })),
    maiorGasto,
  };
}
