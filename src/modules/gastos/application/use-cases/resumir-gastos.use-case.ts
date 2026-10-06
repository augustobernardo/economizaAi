import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import type { Periodo } from '../../domain/periodo.js';
import { resumir, type ResumoDeGastos } from '../../domain/resumo.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import type { Relogio } from '../ports/relogio.js';
import { resolverPeriodo, type PedidoDePeriodo } from './pedido-de-periodo.js';

export class ResumirGastosUseCase {
  constructor(
    private readonly repositorio: GastoRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar(
    pedido: PedidoDePeriodo,
  ): Promise<{ periodo: Periodo; resumo: ResumoDeGastos }> {
    const periodo = resolverPeriodo(pedido, this.relogio.agora());
    const gastos = await this.repositorio.listarPorPeriodo(
      periodo.inicio,
      periodo.fimExclusivo,
    );
    if (gastos.length === 0) throw new NenhumGastoNoPeriodoError(periodo);

    return { periodo, resumo: resumir(gastos) };
  }
}
