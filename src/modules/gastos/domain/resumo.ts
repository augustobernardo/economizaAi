import type { Categoria } from './categoria.js';
import { Dinheiro } from './dinheiro.js';
import type { Gasto } from './gasto.js';

export interface TotalPorCategoria {
  categoria: Categoria;
  total: Dinheiro;
  /** Participação inteira no total; a soma é 100. */
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

/** Inteiros pelo maior resto (Hamilton): a soma é sempre 100. Empate de resto: ordem de `centavos`. */
function percentuaisInteiros(
  centavos: readonly number[],
  total: number,
): number[] {
  const base = centavos.map((c) => Math.floor((c * 100) / total));
  const restos = centavos.map((c) => (c * 100) % total);
  let faltam = 100 - base.reduce((s, p) => s + p, 0);
  const porResto = centavos
    .map((_, i) => i)
    .sort((a, b) => (restos[b] ?? 0) - (restos[a] ?? 0) || a - b);
  for (const i of porResto) {
    if (faltam-- <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
  }
  return base;
}

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

  const ordenadas = [...porCategoria].sort(
    ([catA, a], [catB, b]) => b - a || catA.localeCompare(catB),
  );
  const percentuais = percentuaisInteiros(
    ordenadas.map(([, c]) => c),
    totalCentavos,
  );

  return {
    quantidade: gastos.length,
    total: Dinheiro.deCentavos(totalCentavos),
    porCategoria: ordenadas.map(([categoria, centavos], i) => ({
      categoria,
      total: Dinheiro.deCentavos(centavos),
      percentual: percentuais[i] ?? 0,
    })),
    maiorGasto,
  };
}
