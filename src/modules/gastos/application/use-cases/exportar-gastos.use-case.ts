import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import type { Periodo } from '../../domain/periodo.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import type { ArquivoExportado, Exportador } from '../ports/exportador.js';
import type { Relogio } from '../ports/relogio.js';
import { resolverPeriodo, type PedidoDePeriodo } from './pedido-de-periodo.js';

export class ExportarGastosUseCase {
  constructor(
    private readonly repositorio: GastoRepository,
    private readonly exportadores: readonly Exportador[],
    private readonly relogio: Relogio,
  ) {}

  async executar(pedido: PedidoDePeriodo): Promise<{
    periodo: Periodo;
    quantidade: number;
    arquivos: ArquivoExportado[];
  }> {
    const periodo = resolverPeriodo(pedido, this.relogio.agora());
    const gastos = await this.repositorio.listarPorPeriodo(
      periodo.inicio,
      periodo.fimExclusivo,
    );
    if (gastos.length === 0) throw new NenhumGastoNoPeriodoError(periodo);

    return {
      periodo,
      quantidade: gastos.length,
      arquivos: this.exportadores.map((e) => e.gerar(gastos, periodo)),
    };
  }
}
