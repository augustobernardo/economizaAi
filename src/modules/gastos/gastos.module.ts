import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesfazerRegistroUseCase } from './application/use-cases/desfazer-registro.use-case.js';
import { RegistrarGastosUseCase } from './application/use-cases/registrar-gastos.use-case.js';
import {
  EXTRATOR_DE_GASTOS,
  type ExtratorDeGastos,
} from './application/ports/extrator-de-gastos.js';
import { RELOGIO, type Relogio } from './application/ports/relogio.js';
import {
  GASTO_REPOSITORY,
  type GastoRepository,
} from './domain/ports/gasto.repository.js';
import {
  criarModelosGemini,
  GeminiExtrator,
} from './infrastructure/ia/gemini.extrator.js';
import { TypeOrmGastoRepository } from './infrastructure/persistence/typeorm-gasto.repository.js';
import { RelogioSistema } from './infrastructure/relogio-sistema.js';
import { DevController } from './presentation/http/dev.controller.js';

// Allowlist (fecha por padrão): NODE_ENV ausente ou desconhecido não expõe /dev/*.
const AMBIENTES_COM_ROTAS_DE_DEV = ['development', 'test'];

/** Único lugar que liga ports a adapters. */
@Module({
  controllers: AMBIENTES_COM_ROTAS_DE_DEV.includes(process.env.NODE_ENV ?? '')
    ? [DevController]
    : [],
  providers: [
    { provide: GASTO_REPOSITORY, useClass: TypeOrmGastoRepository },
    { provide: RELOGIO, useClass: RelogioSistema },
    {
      provide: EXTRATOR_DE_GASTOS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new GeminiExtrator(
          criarModelosGemini(config.getOrThrow<string>('GEMINI_API_KEY')),
          config.getOrThrow<string>('GEMINI_MODEL'),
        ),
    },
    {
      provide: RegistrarGastosUseCase,
      inject: [EXTRATOR_DE_GASTOS, GASTO_REPOSITORY, RELOGIO],
      useFactory: (
        extrator: ExtratorDeGastos,
        repositorio: GastoRepository,
        relogio: Relogio,
      ) => new RegistrarGastosUseCase(extrator, repositorio, relogio),
    },
    {
      provide: DesfazerRegistroUseCase,
      inject: [GASTO_REPOSITORY, RELOGIO],
      useFactory: (repositorio: GastoRepository, relogio: Relogio) =>
        new DesfazerRegistroUseCase(repositorio, relogio),
    },
  ],
})
export class GastosModule {}
