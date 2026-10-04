import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';
import type { ResumoDeGastos } from '../../domain/resumo.js';
import type { ArquivoExportado } from '../ports/exportador.js';
import type {
  EntradaMensagem,
  InterpretadorDeMensagem,
} from '../ports/interpretador-de-mensagem.js';
import type { Relogio } from '../ports/relogio.js';
import type { ExportarGastosUseCase } from './exportar-gastos.use-case.js';
import type { ListarUltimosGastosUseCase } from './listar-ultimos-gastos.use-case.js';
import type { RegistrarGastosUseCase } from './registrar-gastos.use-case.js';
import type { ResumirGastosUseCase } from './resumir-gastos.use-case.js';

export type ResultadoProcessamento =
  | {
      tipo: 'registro';
      registroId: string;
      gastos: Gasto[];
      textoOriginal: string;
    }
  | {
      tipo: 'exportacao';
      periodo: Periodo;
      quantidade: number;
      arquivos: ArquivoExportado[];
      textoOriginal: string;
    }
  | {
      tipo: 'resumo';
      periodo: Periodo;
      resumo: ResumoDeGastos;
      textoOriginal: string;
    }
  | { tipo: 'ultimos'; gastos: Gasto[]; textoOriginal: string };

export class ProcessarMensagemUseCase {
  constructor(
    private readonly interpretador: InterpretadorDeMensagem,
    private readonly relogio: Relogio,
    private readonly registrar: RegistrarGastosUseCase,
    private readonly exportar: ExportarGastosUseCase,
    private readonly resumir: ResumirGastosUseCase,
    private readonly listarUltimos: ListarUltimosGastosUseCase,
  ) {}

  async executar(entrada: EntradaMensagem): Promise<ResultadoProcessamento> {
    const interpretacao = await this.interpretador.interpretar(
      entrada,
      this.relogio.agora(),
    );
    const { textoOriginal } = interpretacao;

    switch (interpretacao.intencao) {
      case 'registrar':
        return {
          tipo: 'registro',
          ...(await this.registrar.executar({
            gastos: interpretacao.gastos,
            origem: entrada.tipo,
            textoOriginal,
          })),
        };
      case 'exportar':
        return {
          tipo: 'exportacao',
          ...(await this.exportar.executar(interpretacao)),
          textoOriginal,
        };
      case 'resumir':
        return {
          tipo: 'resumo',
          ...(await this.resumir.executar(interpretacao)),
          textoOriginal,
        };
      case 'listarUltimos':
        return {
          tipo: 'ultimos',
          gastos: await this.listarUltimos.executar(),
          textoOriginal,
        };
    }
  }
}
