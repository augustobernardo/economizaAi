import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Avaliação manual contra a API real (gasta cota). Fora do `pnpm test` e do CI.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.eval-spec.ts'],
    testTimeout: 1_800_000,
  },
});
