import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EXPORTADORES,
  type Exportador,
} from './application/ports/exportador.js';
import {
  INTERPRETADOR_DE_MENSAGEM,
  type InterpretadorDeMensagem,
} from './application/ports/interpretador-de-mensagem.js';
import { RELOGIO, type Relogio } from './application/ports/relogio.js';
import {
  PENDENCIAS_DE_EDICAO,
  PENDENCIAS_DE_REGISTRO,
  type Pendencias,
} from './application/ports/pendencias.js';
import {
  CadastrarCartaoUseCase,
  ListarCartoesUseCase,
  RemoverCartaoUseCase,
} from './application/use-cases/cartoes.use-cases.js';
import { ConcluirRegistroPendenteUseCase } from './application/use-cases/concluir-registro-pendente.use-case.js';
import { DesfazerRegistroUseCase } from './application/use-cases/desfazer-registro.use-case.js';
import {
  CancelarEdicaoUseCase,
  ConfirmarEdicaoUseCase,
  PrepararEdicaoUseCase,
  type PropostaDeEdicao,
} from './application/use-cases/edicao.use-cases.js';
import { ExportarPeriodoUseCase } from './application/use-cases/exportar-periodo.use-case.js';
import {
  CompositorDeFatura,
  ConsultarFaturaUseCase,
  InformarFaturaUseCase,
} from './application/use-cases/faturas.use-cases.js';
import { ListarUltimosGastosUseCase } from './application/use-cases/listar-ultimos-gastos.use-case.js';
import {
  ListarParcelamentosUseCase,
  RemoverParcelamentoUseCase,
} from './application/use-cases/parcelamentos.use-cases.js';
import { ProcessarMensagemUseCase } from './application/use-cases/processar-mensagem.use-case.js';
import {
  RegistrarLancamentosUseCase,
  type RegistroPendente,
} from './application/use-cases/registrar-lancamentos.use-case.js';
import { ResumirPeriodoUseCase } from './application/use-cases/resumir-periodo.use-case.js';
import {
  CARTAO_REPOSITORY,
  type CartaoRepository,
} from './domain/ports/cartao.repository.js';
import {
  ENTRADA_REPOSITORY,
  type EntradaRepository,
} from './domain/ports/entrada.repository.js';
import {
  FATURA_REPOSITORY,
  type FaturaRepository,
} from './domain/ports/fatura.repository.js';
import {
  PARCELAMENTO_REPOSITORY,
  type ParcelamentoRepository,
} from './domain/ports/parcelamento.repository.js';
import {
  REGISTRO_REPOSITORY,
  type RegistroRepository,
} from './domain/ports/registro.repository.js';
import {
  GASTO_REPOSITORY,
  type GastoRepository,
} from './domain/ports/gasto.repository.js';
import { CsvExportador } from './infrastructure/exportacao/csv.exportador.js';
import { MarkdownExportador } from './infrastructure/exportacao/markdown.exportador.js';
import {
  criarModelosGemini,
  GeminiInterpretador,
} from './infrastructure/ia/gemini.interpretador.js';
import { PendenciasEmMemoria } from './infrastructure/pendencias-em-memoria.js';
import { TypeOrmEntradaRepository } from './infrastructure/persistence/typeorm-entrada.repository.js';
import { TypeOrmFaturaRepository } from './infrastructure/persistence/typeorm-fatura.repository.js';
import { TypeOrmParcelamentoRepository } from './infrastructure/persistence/typeorm-parcelamento.repository.js';
import { TypeOrmCartaoRepository } from './infrastructure/persistence/typeorm-cartao.repository.js';
import { TypeOrmRegistroRepository } from './infrastructure/persistence/typeorm-registro.repository.js';
import { TypeOrmGastoRepository } from './infrastructure/persistence/typeorm-gasto.repository.js';
import { RelogioSistema } from './infrastructure/relogio-sistema.js';
import { DevController } from './presentation/http/dev.controller.js';
import { TelegramBot } from './presentation/telegram/telegram-bot.js';

// Allowlist (fecha por padrão): NODE_ENV ausente ou desconhecido não expõe /dev/*.
const AMBIENTES_COM_ROTAS_DE_DEV = ['development', 'test'];

/** Único lugar que liga ports a adapters. */
@Module({
  controllers: AMBIENTES_COM_ROTAS_DE_DEV.includes(process.env.NODE_ENV ?? '')
    ? [DevController]
    : [],
  providers: [
    TelegramBot,
    { provide: GASTO_REPOSITORY, useClass: TypeOrmGastoRepository },
    { provide: CARTAO_REPOSITORY, useClass: TypeOrmCartaoRepository },
    { provide: FATURA_REPOSITORY, useClass: TypeOrmFaturaRepository },
    {
      provide: PARCELAMENTO_REPOSITORY,
      useClass: TypeOrmParcelamentoRepository,
    },
    { provide: ENTRADA_REPOSITORY, useClass: TypeOrmEntradaRepository },
    { provide: REGISTRO_REPOSITORY, useClass: TypeOrmRegistroRepository },
    { provide: RELOGIO, useClass: RelogioSistema },
    {
      provide: PENDENCIAS_DE_REGISTRO,
      inject: [RELOGIO],
      useFactory: (relogio: Relogio) =>
        new PendenciasEmMemoria<RegistroPendente>(relogio),
    },
    {
      provide: PENDENCIAS_DE_EDICAO,
      inject: [RELOGIO],
      useFactory: (relogio: Relogio) =>
        new PendenciasEmMemoria<PropostaDeEdicao>(relogio),
    },
    {
      provide: EXPORTADORES,
      useFactory: (): Exportador[] => [
        new CsvExportador(),
        new MarkdownExportador(),
      ],
    },
    {
      provide: INTERPRETADOR_DE_MENSAGEM,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new GeminiInterpretador(
          criarModelosGemini(config.getOrThrow<string>('GEMINI_API_KEY')),
          config.getOrThrow<string>('GEMINI_MODEL'),
        ),
    },
    {
      provide: RegistrarLancamentosUseCase,
      inject: [
        REGISTRO_REPOSITORY,
        CARTAO_REPOSITORY,
        PENDENCIAS_DE_REGISTRO,
        RELOGIO,
      ],
      useFactory: (
        registros: RegistroRepository,
        cartoes: CartaoRepository,
        pendencias: Pendencias<RegistroPendente>,
        relogio: Relogio,
      ) =>
        new RegistrarLancamentosUseCase(
          registros,
          cartoes,
          pendencias,
          relogio,
        ),
    },
    {
      provide: ConcluirRegistroPendenteUseCase,
      inject: [RegistrarLancamentosUseCase, PENDENCIAS_DE_REGISTRO],
      useFactory: (
        registrar: RegistrarLancamentosUseCase,
        pendencias: Pendencias<RegistroPendente>,
      ) => new ConcluirRegistroPendenteUseCase(registrar, pendencias),
    },
    {
      provide: DesfazerRegistroUseCase,
      inject: [REGISTRO_REPOSITORY, RELOGIO],
      useFactory: (registros: RegistroRepository, relogio: Relogio) =>
        new DesfazerRegistroUseCase(registros, relogio),
    },
    {
      provide: PrepararEdicaoUseCase,
      inject: [
        REGISTRO_REPOSITORY,
        CARTAO_REPOSITORY,
        INTERPRETADOR_DE_MENSAGEM,
        PENDENCIAS_DE_EDICAO,
        RELOGIO,
      ],
      useFactory: (
        registros: RegistroRepository,
        cartoes: CartaoRepository,
        interpretador: InterpretadorDeMensagem,
        pendencias: Pendencias<PropostaDeEdicao>,
        relogio: Relogio,
      ) =>
        new PrepararEdicaoUseCase(
          registros,
          cartoes,
          interpretador,
          pendencias,
          relogio,
        ),
    },
    {
      provide: ConfirmarEdicaoUseCase,
      inject: [REGISTRO_REPOSITORY, PENDENCIAS_DE_EDICAO],
      useFactory: (
        registros: RegistroRepository,
        pendencias: Pendencias<PropostaDeEdicao>,
      ) => new ConfirmarEdicaoUseCase(registros, pendencias),
    },
    {
      provide: CancelarEdicaoUseCase,
      inject: [PENDENCIAS_DE_EDICAO],
      useFactory: (pendencias: Pendencias<PropostaDeEdicao>) =>
        new CancelarEdicaoUseCase(pendencias),
    },
    {
      provide: CadastrarCartaoUseCase,
      inject: [CARTAO_REPOSITORY, RELOGIO],
      useFactory: (cartoes: CartaoRepository, relogio: Relogio) =>
        new CadastrarCartaoUseCase(cartoes, relogio),
    },
    {
      provide: ListarCartoesUseCase,
      inject: [CARTAO_REPOSITORY],
      useFactory: (cartoes: CartaoRepository) =>
        new ListarCartoesUseCase(cartoes),
    },
    {
      provide: RemoverCartaoUseCase,
      inject: [CARTAO_REPOSITORY],
      useFactory: (cartoes: CartaoRepository) =>
        new RemoverCartaoUseCase(cartoes),
    },
    {
      provide: ListarParcelamentosUseCase,
      inject: [PARCELAMENTO_REPOSITORY, CARTAO_REPOSITORY, RELOGIO],
      useFactory: (
        parcelamentos: ParcelamentoRepository,
        cartoes: CartaoRepository,
        relogio: Relogio,
      ) => new ListarParcelamentosUseCase(parcelamentos, cartoes, relogio),
    },
    {
      provide: RemoverParcelamentoUseCase,
      inject: [PARCELAMENTO_REPOSITORY],
      useFactory: (parcelamentos: ParcelamentoRepository) =>
        new RemoverParcelamentoUseCase(parcelamentos),
    },
    {
      provide: CompositorDeFatura,
      inject: [
        GASTO_REPOSITORY,
        PARCELAMENTO_REPOSITORY,
        ENTRADA_REPOSITORY,
        FATURA_REPOSITORY,
      ],
      useFactory: (
        gastos: GastoRepository,
        parcelamentos: ParcelamentoRepository,
        entradas: EntradaRepository,
        faturas: FaturaRepository,
      ) => new CompositorDeFatura(gastos, parcelamentos, entradas, faturas),
    },
    {
      provide: InformarFaturaUseCase,
      inject: [
        CARTAO_REPOSITORY,
        FATURA_REPOSITORY,
        CompositorDeFatura,
        RELOGIO,
      ],
      useFactory: (
        cartoes: CartaoRepository,
        faturas: FaturaRepository,
        compositor: CompositorDeFatura,
        relogio: Relogio,
      ) => new InformarFaturaUseCase(cartoes, faturas, compositor, relogio),
    },
    {
      provide: ConsultarFaturaUseCase,
      inject: [CARTAO_REPOSITORY, CompositorDeFatura, RELOGIO],
      useFactory: (
        cartoes: CartaoRepository,
        compositor: CompositorDeFatura,
        relogio: Relogio,
      ) => new ConsultarFaturaUseCase(cartoes, compositor, relogio),
    },
    {
      provide: ResumirPeriodoUseCase,
      inject: [
        GASTO_REPOSITORY,
        ENTRADA_REPOSITORY,
        PARCELAMENTO_REPOSITORY,
        CARTAO_REPOSITORY,
        FATURA_REPOSITORY,
        CompositorDeFatura,
        RELOGIO,
      ],
      useFactory: (
        gastos: GastoRepository,
        entradas: EntradaRepository,
        parcelamentos: ParcelamentoRepository,
        cartoes: CartaoRepository,
        faturas: FaturaRepository,
        compositor: CompositorDeFatura,
        relogio: Relogio,
      ) =>
        new ResumirPeriodoUseCase(
          gastos,
          entradas,
          parcelamentos,
          cartoes,
          faturas,
          compositor,
          relogio,
        ),
    },
    {
      provide: ExportarPeriodoUseCase,
      inject: [ResumirPeriodoUseCase, EXPORTADORES],
      useFactory: (
        periodos: ResumirPeriodoUseCase,
        exportadores: Exportador[],
      ) => new ExportarPeriodoUseCase(periodos, exportadores),
    },
    {
      provide: ListarUltimosGastosUseCase,
      inject: [GASTO_REPOSITORY],
      useFactory: (repositorio: GastoRepository) =>
        new ListarUltimosGastosUseCase(repositorio),
    },
    {
      provide: ProcessarMensagemUseCase,
      inject: [
        INTERPRETADOR_DE_MENSAGEM,
        RELOGIO,
        RegistrarLancamentosUseCase,
        ExportarPeriodoUseCase,
        ResumirPeriodoUseCase,
        ListarUltimosGastosUseCase,
        CARTAO_REPOSITORY,
        InformarFaturaUseCase,
        ConsultarFaturaUseCase,
      ],
      useFactory: (
        interpretador: InterpretadorDeMensagem,
        relogio: Relogio,
        registrar: RegistrarLancamentosUseCase,
        exportar: ExportarPeriodoUseCase,
        resumir: ResumirPeriodoUseCase,
        listarUltimos: ListarUltimosGastosUseCase,
        cartoes: CartaoRepository,
        informarFatura: InformarFaturaUseCase,
        consultarFatura: ConsultarFaturaUseCase,
      ) =>
        new ProcessarMensagemUseCase(
          interpretador,
          relogio,
          registrar,
          exportar,
          resumir,
          listarUltimos,
          cartoes,
          informarFatura,
          consultarFatura,
        ),
    },
  ],
})
export class GastosModule {}
