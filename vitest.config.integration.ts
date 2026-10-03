import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { URL_BANCO_DE_TESTE } from './test/setup/url-banco-de-teste.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.int-spec.ts'],
    globalSetup: ['test/setup/migrar-banco-de-teste.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? URL_BANCO_DE_TESTE,
    },
  },
});
