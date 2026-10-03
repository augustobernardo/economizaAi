import { describe, expect, it } from 'vitest';
import { envSchema, validarEnv } from './env.schema.js';

function envValido(sobrescrever: Partial<Record<string, unknown>> = {}) {
  return {
    DATABASE_URL: 'postgresql://user:senha@localhost:5432/economizaai',
    TELEGRAM_BOT_TOKEN: 'token-fake-123',
    TELEGRAM_OWNER_ID: '123456',
    GEMINI_API_KEY: 'gemini-fake-key',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GROQ_API_KEY: 'groq-fake-key',
    GROQ_TRANSCRIPTION_MODEL: 'whisper-large-v3',
    GROQ_TEXT_MODEL: 'llama-3.3-70b-versatile',
    ...sobrescrever,
  };
}

describe('envSchema', () => {
  it('rejeita DATABASE_URL inválida', () => {
    const resultado = envSchema.safeParse(
      envValido({ DATABASE_URL: 'isso-nao-e-uma-url' }),
    );

    expect(resultado.success).toBe(false);
  });

  it('rejeita TELEGRAM_OWNER_ID não numérico', () => {
    const resultado = envSchema.safeParse(
      envValido({ TELEGRAM_OWNER_ID: 'abc' }),
    );

    expect(resultado.success).toBe(false);
  });

  it('rejeita TELEGRAM_OWNER_ID não positivo', () => {
    const resultado = envSchema.safeParse(
      envValido({ TELEGRAM_OWNER_ID: '-5' }),
    );

    expect(resultado.success).toBe(false);
  });

  it('aplica defaults de NODE_ENV, PORT e TZ quando ausentes', () => {
    const resultado = envSchema.safeParse(envValido());

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.NODE_ENV).toBe('development');
      expect(resultado.data.PORT).toBe(3000);
      expect(resultado.data.TZ).toBe('America/Sao_Paulo');
    }
  });

  it('aceita um env válido completo', () => {
    const resultado = envSchema.safeParse(
      envValido({ NODE_ENV: 'production', PORT: '8080', TZ: 'UTC' }),
    );

    expect(resultado.success).toBe(true);
  });

  it('rejeita quando falta TELEGRAM_BOT_TOKEN', () => {
    const { TELEGRAM_BOT_TOKEN: _TELEGRAM_BOT_TOKEN, ...semToken } =
      envValido();
    const resultado = envSchema.safeParse(semToken);

    expect(resultado.success).toBe(false);
  });

  it('converte PORT de string para número', () => {
    const resultado = envSchema.safeParse(envValido({ PORT: '8080' }));

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.PORT).toBe(8080);
      expect(typeof resultado.data.PORT).toBe('number');
    }
  });
});

describe('validarEnv', () => {
  it('retorna o env tipado quando válido', () => {
    const env = validarEnv(envValido());

    expect(env.TELEGRAM_OWNER_ID).toBe(123456);
  });

  it('lança um erro listando as chaves inválidas', () => {
    expect(() =>
      validarEnv(
        envValido({ DATABASE_URL: 'invalida', TELEGRAM_OWNER_ID: 'abc' }),
      ),
    ).toThrowError(/DATABASE_URL/);
  });

  it('nunca inclui o valor de uma chave válida na mensagem de erro, mesmo quando outra chave falha', () => {
    const tokenSecreto = 'token-super-secreto-nao-deve-aparecer';

    try {
      validarEnv(
        envValido({
          DATABASE_URL: 'invalida',
          TELEGRAM_BOT_TOKEN: tokenSecreto,
        }),
      );
      throw new Error('deveria ter lançado');
    } catch (erro) {
      expect((erro as Error).message).not.toContain(tokenSecreto);
    }
  });

  it('nunca inclui o valor inválido de DATABASE_URL na mensagem de erro', () => {
    const urlInvalida = 'valor-que-nao-deve-aparecer na mensagem';

    try {
      validarEnv(
        envValido({ DATABASE_URL: urlInvalida, TELEGRAM_OWNER_ID: 'abc' }),
      );
      throw new Error('deveria ter lançado');
    } catch (erro) {
      expect((erro as Error).message).not.toContain(urlInvalida);
    }
  });
});
