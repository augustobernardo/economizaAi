import { DataSource } from 'typeorm';
import { opcoesDoBanco } from './opcoes.js';

/** Usado pela CLI do TypeORM (`pnpm migration:run`). */
export default new DataSource(opcoesDoBanco(process.env.DATABASE_URL ?? ''));
