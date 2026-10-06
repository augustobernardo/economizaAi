import { describe, expect, it } from 'vitest';
import {
  respostaInterpretacaoAudioJsonSchema,
  respostaInterpretacaoAudioSchema,
  respostaInterpretacaoJsonSchema,
  respostaInterpretacaoSchema,
} from './schema.js';

const gasto = {
  valorReais: 32.5,
  categoria: 'transporte',
  descricao: 'Uber',
  dataGasto: '2026-10-02',
};
const base = {
  intencao: 'registrar',
  gastos: [] as unknown[],
  inicio: null,
  fim: null,
};

describe('respostaInterpretacaoSchema', () => {
  it.each(['registrar', 'exportar', 'resumir', 'listarUltimos'])(
    'aceita a intenção %s',
    (intencao) => {
      expect(
        respostaInterpretacaoSchema.safeParse({ ...base, intencao }).success,
      ).toBe(true);
    },
  );

  it('aceita gasto válido e período preenchido', () => {
    expect(
      respostaInterpretacaoSchema.safeParse({
        ...base,
        gastos: [gasto],
        inicio: '2026-10-01',
        fim: '2026-10-04',
      }).success,
    ).toBe(true);
  });

  const { inicio: _i, ...semInicio } = base;
  const { fim: _f, ...semFim } = base;
  it.each([
    ['intenção desconhecida', { ...base, intencao: 'apagar' }],
    ['campo extra na raiz', { ...base, instrucao: 'ok' }],
    ['campo extra no item', { ...base, gastos: [{ ...gasto, x: 1 }] }],
    ['11 itens', { ...base, gastos: Array.from({ length: 11 }, () => gasto) }],
    ['inicio em formato BR', { ...base, inicio: '01/10/2026' }],
    ['fim em formato BR', { ...base, fim: '04/10/2026' }],
    ['sem inicio', semInicio],
    ['sem fim', semFim],
    ['valor negativo', { ...base, gastos: [{ ...gasto, valorReais: -5 }] }],
    ['valor zero', { ...base, gastos: [{ ...gasto, valorReais: 0 }] }],
    [
      'categoria desconhecida',
      { ...base, gastos: [{ ...gasto, categoria: 'supermercado' }] },
    ],
    [
      'descrição em branco',
      { ...base, gastos: [{ ...gasto, descricao: '   ' }] },
    ],
    [
      'descrição com caractere bidi (U+202E)',
      { ...base, gastos: [{ ...gasto, descricao: 'Uber‮soicnif' }] },
    ],
    [
      'descrição com caractere de controle',
      { ...base, gastos: [{ ...gasto, descricao: 'Uber\u0000' }] },
    ],
    [
      'descrição com zero-width space',
      { ...base, gastos: [{ ...gasto, descricao: 'Ub​er' }] },
    ],
    [
      'dataGasto em formato BR',
      { ...base, gastos: [{ ...gasto, dataGasto: '01/10/2026' }] },
    ],
  ])('recusa %s', (_nome, entrada) => {
    expect(respostaInterpretacaoSchema.safeParse(entrada).success).toBe(false);
  });

  it('aceita descrição em português com acentos e pontuação', () => {
    const entrada = {
      ...base,
      gastos: [{ ...gasto, descricao: 'Pão de açúcar - café (2x), R$ 5,50!' }],
    };
    expect(respostaInterpretacaoSchema.safeParse(entrada).success).toBe(true);
  });

  it('JSON Schema não tem $schema e exige intencao, gastos, inicio e fim', () => {
    expect(respostaInterpretacaoJsonSchema).not.toHaveProperty('$schema');
    expect(respostaInterpretacaoJsonSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['intencao', 'gastos', 'inicio', 'fim']),
    });
  });
});

describe('respostaInterpretacaoAudioSchema', () => {
  const audio = (transcricao: unknown) => ({ ...base, transcricao });

  it('aceita transcricao vazia e comum', () => {
    expect(respostaInterpretacaoAudioSchema.safeParse(audio('')).success).toBe(
      true,
    );
    expect(
      respostaInterpretacaoAudioSchema.safeParse(audio('gastei 50')).success,
    ).toBe(true);
  });

  it('aceita exatamente 2000 caracteres e recusa 2001', () => {
    expect(
      respostaInterpretacaoAudioSchema.safeParse(audio('x'.repeat(2000)))
        .success,
    ).toBe(true);
    expect(
      respostaInterpretacaoAudioSchema.safeParse(audio('x'.repeat(2001)))
        .success,
    ).toBe(false);
  });

  it('aplica trim na transcricao', () => {
    const { transcricao } = respostaInterpretacaoAudioSchema.parse(
      audio('  oi  '),
    );
    expect(transcricao).toBe('oi');
  });

  it('rejeita sem transcricao e com campo extra', () => {
    expect(respostaInterpretacaoAudioSchema.safeParse(base).success).toBe(
      false,
    );
    expect(
      respostaInterpretacaoAudioSchema.safeParse({ ...audio(''), extra: 1 })
        .success,
    ).toBe(false);
  });

  it('JSON Schema de áudio não tem $schema e exige transcricao', () => {
    expect(respostaInterpretacaoAudioJsonSchema).not.toHaveProperty('$schema');
    expect(respostaInterpretacaoAudioJsonSchema.required).toContain(
      'transcricao',
    );
  });
});

describe('JSON Schema enviado ao Gemini', () => {
  it('não carrega escapes Unicode (\\p{...}) que a API pode recusar', () => {
    expect(JSON.stringify(respostaInterpretacaoJsonSchema)).not.toContain(
      '\\\\p{',
    );
    expect(JSON.stringify(respostaInterpretacaoAudioJsonSchema)).not.toContain(
      '\\\\p{',
    );
  });
});
