import type { Entrada } from '../../domain/entrada.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Parcelamento } from '../../domain/parcelamento.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { Cartao } from '../../domain/cartao.js';
import type { Periodo } from '../../domain/periodo.js';
import type {
  ComposicaoDaFatura,
  FaturaInformada,
} from '../../domain/fatura.js';
import type { ResumoDoPeriodo } from '../../domain/resumo-do-periodo.js';
import type { ArquivoExportado } from '../ports/exportador.js';
import type {
  EntradaMensagem,
  Interpretacao,
  InterpretadorDeMensagem,
} from '../ports/interpretador-de-mensagem.js';
import type { Relogio } from '../ports/relogio.js';
import type { ExportarPeriodoUseCase } from './exportar-periodo.use-case.js';
import type {
  ConsultarFaturaUseCase,
  InformarFaturaUseCase,
} from './faturas.use-cases.js';
import type { ListarUltimosGastosUseCase } from './listar-ultimos-gastos.use-case.js';
import type {
  AvisoRegistro,
  Escolha,
  RegistrarLancamentosUseCase,
} from './registrar-lancamentos.use-case.js';
import type { ResumirPeriodoUseCase } from './resumir-periodo.use-case.js';

export type ResultadoProcessamento =
  | {
      tipo: 'registro';
      registroId: string;
      gastos: Gasto[];
      entradas: Entrada[];
      parcelamentos: Parcelamento[];
      cartoes: Map<string, Cartao>;
      avisos: AvisoRegistro[];
      textoOriginal: string;
    }
  | {
      tipo: 'escolha';
      pendenteId: string;
      escolha: Escolha;
      opcoes: { rotulo: string; valor: string }[];
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
      resumo: ResumoDoPeriodo;
      cartoes: ReadonlyMap<string, Cartao>;
      textoOriginal: string;
    }
  | { tipo: 'ultimos'; gastos: Gasto[]; textoOriginal: string }
  | {
      tipo: 'fatura-informada';
      cartao: Cartao;
      fatura: FaturaInformada;
      anterior: FaturaInformada | null;
      composicao: ComposicaoDaFatura;
      textoOriginal: string;
    }
  | {
      tipo: 'faturas';
      itens: { cartao: Cartao; composicao: ComposicaoDaFatura }[];
      textoOriginal: string;
    };

export class ProcessarMensagemUseCase {
  constructor(
    private readonly interpretador: InterpretadorDeMensagem,
    private readonly relogio: Relogio,
    private readonly registrar: RegistrarLancamentosUseCase,
    private readonly exportar: ExportarPeriodoUseCase,
    private readonly resumir: ResumirPeriodoUseCase,
    private readonly listarUltimos: ListarUltimosGastosUseCase,
    private readonly cartoes: CartaoRepository,
    private readonly informarFatura: InformarFaturaUseCase,
    private readonly consultarFatura: ConsultarFaturaUseCase,
  ) {}

  async executar(entrada: EntradaMensagem): Promise<ResultadoProcessamento> {
    const interpretacao = await this.interpretador.interpretar(
      entrada,
      this.relogio.agora(),
      { cartoes: (await this.cartoes.listar()).map((c) => c.nome) },
    );
    const { textoOriginal } = interpretacao;

    switch (interpretacao.intencao) {
      case 'registrar':
        return this.registrarLancamentos(interpretacao, entrada.tipo);
      case 'exportar':
        return {
          tipo: 'exportacao',
          ...(await this.exportar.executar({
            inicio: interpretacao.inicio,
            fim: interpretacao.fim,
          })),
          textoOriginal,
        };
      case 'resumir':
        return {
          tipo: 'resumo',
          ...(await this.resumir.executar({
            inicio: interpretacao.inicio,
            fim: interpretacao.fim,
          })),
          textoOriginal,
        };
      case 'listarUltimos':
        return {
          tipo: 'ultimos',
          gastos: await this.listarUltimos.executar(),
          textoOriginal,
        };
      case 'informarFatura':
        return {
          tipo: 'fatura-informada',
          ...(await this.informarFatura.executar(interpretacao)),
          textoOriginal,
        };
      case 'consultarFatura':
        return {
          tipo: 'faturas',
          itens: await this.consultarFatura.executar(interpretacao),
          textoOriginal,
        };
    }
  }

  private async registrarLancamentos(
    interpretacao: Extract<Interpretacao, { intencao: 'registrar' }>,
    origem: EntradaMensagem['tipo'],
  ): Promise<ResultadoProcessamento> {
    const r = await this.registrar.executar({ interpretacao, origem });
    return r.tipo === 'registrado' ? { ...r, tipo: 'registro' } : r;
  }
}
