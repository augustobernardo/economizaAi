import type { Periodo } from '../../domain/periodo.js';
import type { ArquivoExportado, Exportador } from '../ports/exportador.js';
import type { PedidoDePeriodo } from './pedido-de-periodo.js';
import type { ResumirPeriodoUseCase } from './resumir-periodo.use-case.js';

export class ExportarPeriodoUseCase {
  constructor(
    private readonly periodos: ResumirPeriodoUseCase,
    private readonly exportadores: readonly Exportador[],
  ) {}

  async executar(pedido: PedidoDePeriodo): Promise<{
    periodo: Periodo;
    quantidade: number;
    arquivos: ArquivoExportado[];
  }> {
    const dados = await this.periodos.carregar(pedido);
    return {
      periodo: dados.periodo,
      quantidade:
        dados.gastos.length +
        dados.entradas.length +
        dados.resumo.parcelas.itens.length,
      arquivos: this.exportadores.map((e) => e.gerar(dados)),
    };
  }
}
