import type { Cartao } from '../../src/modules/gastos/domain/cartao.js';
import type { Entrada } from '../../src/modules/gastos/domain/entrada.js';
import type { Parcelamento } from '../../src/modules/gastos/domain/parcelamento.js';
import type { DadosDoPeriodo } from '../../src/modules/gastos/application/ports/exportador.js';
import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { Periodo } from '../../src/modules/gastos/domain/periodo.js';
import {
  resumirPeriodo,
  type ResumoDoPeriodo,
} from '../../src/modules/gastos/domain/resumo-do-periodo.js';

/** `DadosDoPeriodo` só com gastos (precisa de pelo menos um), para specs de exportador. */
export function dadosComGastos(
  gastos: readonly Gasto[],
  periodo: Periodo,
): DadosDoPeriodo {
  const resumo = resumirPeriodo({
    meses: [],
    gastos,
    entradas: [],
    parcelamentos: [],
    faturas: [],
  });
  if (resumo === null)
    throw new Error('dadosComGastos exige ao menos um gasto');
  return { periodo, resumo, gastos, entradas: [], cartoes: new Map() };
}

interface PropsDados {
  periodo: Periodo;
  gastos?: readonly Gasto[];
  entradas?: readonly Entrada[];
  parcelamentos?: readonly Parcelamento[];
  cartoes?: readonly Cartao[];
  faturas?: ResumoDoPeriodo['faturas'];
}

/** `DadosDoPeriodo` completo; os meses de competência vêm do próprio período. */
export function dadosDoPeriodo(p: PropsDados): DadosDoPeriodo {
  const gastos = p.gastos ?? [];
  const entradas = p.entradas ?? [];
  const resumo = resumirPeriodo({
    meses: [p.periodo.inicio.slice(0, 7)],
    gastos,
    entradas,
    parcelamentos: p.parcelamentos ?? [],
    faturas: p.faturas ?? [],
  });
  if (resumo === null) throw new Error('dadosDoPeriodo exige algum lançamento');
  return {
    periodo: p.periodo,
    resumo,
    gastos,
    entradas,
    cartoes: new Map((p.cartoes ?? []).map((c) => [c.id, c])),
  };
}
