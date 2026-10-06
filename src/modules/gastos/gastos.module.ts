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
import { DesfazerRegistroUseCase } from './application/use-cases/desfazer-registro.use-case.js';
import { ExportarGastosUseCase } from './application/use-cases/exportar-gastos.use-case.js';
import { ListarUltimosGastosUseCase } from './application/use-cases/listar-ultimos-gastos.use-case.js';
import { ProcessarMensagemUseCase } from './application/use-cases/processar-mensagem.use-case.js';
import { RegistrarGastosUseCase } from './application/use-cases/registrar-gastos.use-case.js';
import { ResumirGastosUseCase } from './application/use-cases/resumir-gastos.use-case.js';
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
    { provide: RELOGIO, useClass: RelogioSistema },
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
      provide: RegistrarGastosUseCase,
      inject: [GASTO_REPOSITORY, RELOGIO],
      useFactory: (repositorio: GastoRepository, relogio: Relogio) =>
        new RegistrarGastosUseCase(repositorio, relogio),
    },
    {
      provide: DesfazerRegistroUseCase,
      inject: [GASTO_REPOSITORY, RELOGIO],
      useFactory: (repositorio: GastoRepository, relogio: Relogio) =>
        new DesfazerRegistroUseCase(repositorio, relogio),
    },
    {
      provide: ExportarGastosUseCase,
      inject: [GASTO_REPOSITORY, EXPORTADORES, RELOGIO],
      useFactory: (
        repositorio: GastoRepository,
        exportadores: Exportador[],
        relogio: Relogio,
      ) => new ExportarGastosUseCase(repositorio, exportadores, relogio),
    },
    {
      provide: ResumirGastosUseCase,
      inject: [GASTO_REPOSITORY, RELOGIO],
      useFactory: (repositorio: GastoRepository, relogio: Relogio) =>
        new ResumirGastosUseCase(repositorio, relogio),
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
        RegistrarGastosUseCase,
        ExportarGastosUseCase,
        ResumirGastosUseCase,
        ListarUltimosGastosUseCase,
      ],
      useFactory: (
        interpretador: InterpretadorDeMensagem,
        relogio: Relogio,
        registrar: RegistrarGastosUseCase,
        exportar: ExportarGastosUseCase,
        resumir: ResumirGastosUseCase,
        listarUltimos: ListarUltimosGastosUseCase,
      ) =>
        new ProcessarMensagemUseCase(
          interpretador,
          relogio,
          registrar,
          exportar,
          resumir,
          listarUltimos,
        ),
    },
  ],
})
export class GastosModule {}
