import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';
import { validarEnv } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
    }),
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
