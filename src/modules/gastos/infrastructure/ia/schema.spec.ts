import { describe, expect, it } from 'vitest';
import {
  respostaExtracaoJsonSchema,
  respostaExtracaoSchema,
} from './schema.js';

const gasto = {
  valorReais: 32.5,
  categoria: 'transporte',
  descricao: 'Uber',
  dataGasto: '2026-10-02',
};

describe('respostaExtracaoSchema', () => {
  it('aceita lista vazia e gasto válido', () => {
    expect(respostaExtracaoSchema.safeParse({ gastos: [] }).success).toBe(true);
    expect(respostaExtracaoSchema.safeParse({ gastos: [gasto] }).success).toBe(
      true,
    );
  });

  it.each([
    ['campo extra no item', { gastos: [{ ...gasto, x: 1 }] }],
    ['campo extra na raiz', { gastos: [], instrucao: 'ok' }],
    ['11 itens', { gastos: Array.from({ length: 11 }, () => gasto) }],
    ['data em formato BR', { gastos: [{ ...gasto, dataGasto: '01/10/2026' }] }],
    ['valor negativo', { gastos: [{ ...gasto, valorReais: -5 }] }],
    ['valor zero', { gastos: [{ ...gasto, valorReais: 0 }] }],
    [
      'categoria desconhecida',
      { gastos: [{ ...gasto, categoria: 'supermercado' }] },
    ],
    ['descrição em branco', { gastos: [{ ...gasto, descricao: '   ' }] }],
  ])('recusa %s', (_nome, entrada) => {
    expect(respostaExtracaoSchema.safeParse(entrada).success).toBe(false);
  });

  it('gera JSON Schema de objeto com gastos obrigatório', () => {
    expect(respostaExtracaoJsonSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['gastos']),
    });
  });

  it('JSON Schema enviado ao Gemini (snapshot)', () => {
    expect(respostaExtracaoJsonSchema).toMatchInlineSnapshot(`
      {
        "additionalProperties": false,
        "properties": {
          "gastos": {
            "items": {
              "additionalProperties": false,
              "properties": {
                "categoria": {
                  "enum": [
                    "alimentacao",
                    "mercado",
                    "transporte",
                    "moradia",
                    "saude",
                    "lazer",
                    "educacao",
                    "assinaturas",
                    "vestuario",
                    "outros",
                  ],
                  "type": "string",
                },
                "dataGasto": {
                  "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
                  "type": "string",
                },
                "descricao": {
                  "maxLength": 200,
                  "minLength": 1,
                  "type": "string",
                },
                "valorReais": {
                  "minimum": 0.01,
                  "type": "number",
                },
              },
              "required": [
                "valorReais",
                "categoria",
                "descricao",
                "dataGasto",
              ],
              "type": "object",
            },
            "maxItems": 10,
            "type": "array",
          },
        },
        "required": [
          "gastos",
        ],
        "type": "object",
      }
    `);
  });
});
