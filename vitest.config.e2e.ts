import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Env sintético para o ConfigModule.forRoot({ validate: validarEnv })
    // (src/app.module.ts) passar sem depender de um .env real: o Nest
    // decora e valida o ambiente já na importação do AppModule, antes de
    // qualquer beforeEach rodar, então os valores precisam existir em
    // process.env antes do test runner importar o arquivo de teste.
    // `test.env` injeta isso no processo do worker antes disso acontecer.
    // Valores óbviamente falsos; nunca aponta para serviços reais.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://usuario-fake:senha-fake@localhost:5432/db-fake',
      TELEGRAM_BOT_TOKEN: 'token-fake-e2e',
      TELEGRAM_OWNER_ID: '1',
      GEMINI_API_KEY: 'gemini-fake-e2e',
      GEMINI_MODEL: 'gemini-fake-model',
    },
  },
});
