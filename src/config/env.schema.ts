import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  TZ: z.string().default('America/Sao_Paulo'),
  DATABASE_URL: z.url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_OWNER_ID: z.coerce.number().int().positive(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente com `envSchema`. Em caso de falha, lança um
 * erro listando apenas as *chaves* inválidas — nunca os valores recebidos,
 * para não vazar segredos (tokens, chaves de API, strings de conexão) na
 * mensagem de erro de boot.
 */
export function validarEnv(config: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(config);

  if (!resultado.success) {
    const chaves = [
      ...new Set(resultado.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes: ${chaves.join(', ')}`,
    );
  }

  return resultado.data;
}
