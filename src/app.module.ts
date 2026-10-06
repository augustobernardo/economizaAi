import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcoesDoBanco } from './database/opcoes.js';
import { GastosModule } from './modules/gastos/gastos.module.js';
import { HealthController } from './health/health.controller.js';
import { validarEnv } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        opcoesDoBanco(config.getOrThrow<string>('DATABASE_URL')),
    }),
    GastosModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
