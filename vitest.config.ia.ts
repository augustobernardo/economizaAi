import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Testes manuais contra a API real (gastam cota). Fora do `pnpm test` e do CI.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.ia-spec.ts'],
    testTimeout: 60_000,
  },
});
