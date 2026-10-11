import { describe, expect, it } from 'vitest';
import {
  respostaCorrecaoAudioJsonSchema,
  respostaCorrecaoJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV6,
  respostaInterpretacaoJsonSchemaV6,
  respostaCorrecaoAudioSchema,
  respostaCorrecaoSchema,
  respostaInterpretacaoAudioSchemaV6,
  respostaInterpretacaoSchemaV6,
  respostaInterpretacaoAudioJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV5,
  respostaInterpretacaoJsonSchemaV5,
  respostaInterpretacaoSchemaComDescricoes,
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

  it('aceita emoji composto (ZWJ U+200D)', () => {
    const entrada = {
      ...base,
      gastos: [{ ...gasto, descricao: 'Passeio 👨\u200D👩\u200D👧' }],
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

describe('schema v5 (com descrições)', () => {
  const props = respostaInterpretacaoJsonSchemaV5.properties as Record<
    string,
    any
  >;
  const itemProps = props.gastos.items.properties as Record<string, any>;

  it.each(['valorReais', 'categoria', 'descricao', 'dataGasto'])(
    'descreve o campo do gasto %s',
    (campo) => expect(itemProps[campo].description).toEqual(expect.any(String)),
  );
  it.each(['intencao', 'gastos', 'inicio', 'fim'])('descreve %s', (campo) =>
    expect(props[campo].description).toEqual(expect.any(String)),
  );
  it('áudio descreve transcricao e não tem $schema', () => {
    expect(respostaInterpretacaoAudioJsonSchemaV5).not.toHaveProperty(
      '$schema',
    );
    expect(
      (respostaInterpretacaoAudioJsonSchemaV5.properties as any).transcricao
        .description,
    ).toEqual(expect.any(String));
  });
  it('o schema sem descrição não muda', () => {
    expect(JSON.stringify(respostaInterpretacaoJsonSchema)).not.toContain(
      'description',
    );
  });
  it('a validação continua estrita', () => {
    expect(
      respostaInterpretacaoSchemaComDescricoes.safeParse({ ...base, extra: 1 })
        .success,
    ).toBe(false);
    expect(
      respostaInterpretacaoSchemaComDescricoes.safeParse({
        ...base,
        gastos: [{ ...gasto, x: 1 }],
      }).success,
    ).toBe(false);
    expect(
      respostaInterpretacaoSchemaComDescricoes.safeParse({
        ...base,
        gastos: [gasto],
      }).success,
    ).toBe(true);
  });
});

describe('schema v6', () => {
  const gastoV6 = { ...gasto, cartao: 'Nubank', formaPagamento: 'credito' };
  const entrada = {
    valorReais: 3500,
    categoria: 'salario',
    descricao: 'Salário',
    dataEntrada: '2026-10-05',
    cartao: null,
    mesFatura: null,
  };
  const parcelamento = {
    descricao: 'Celular',
    categoria: 'outros',
    cartao: 'Nubank',
    totalReais: null,
    valorParcelaReais: 150,
    quantidade: 10,
    parcelaAtual: 3,
    dataCompra: '2026-10-05',
  };
  const completa = {
    intencao: 'registrar',
    gastos: [gastoV6],
    entradas: [entrada],
    parcelamentos: [parcelamento],
    inicio: null,
    fim: null,
    fatura: null,
  };
  const ok = (v: unknown) => respostaInterpretacaoSchemaV6.safeParse(v).success;

  it('aceita resposta completa e as intenções de fatura', () => {
    expect(ok(completa)).toBe(true);
    expect(
      ok({
        ...completa,
        intencao: 'informarFatura',
        gastos: [],
        entradas: [],
        parcelamentos: [],
        fatura: { cartao: 'Nubank', mes: '2026-11', valorReais: 400 },
      }),
    ).toBe(true);
  });

  it.each([
    ['campo extra na raiz', { ...completa, x: 1 }],
    ['campo extra no gasto', { ...completa, gastos: [{ ...gastoV6, x: 1 }] }],
    ['gasto sem cartao', { ...completa, gastos: [gasto] }],
    [
      'forma desconhecida',
      { ...completa, gastos: [{ ...gastoV6, formaPagamento: 'pix' }] },
    ],
    [
      'cartão com 31 caracteres',
      { ...completa, gastos: [{ ...gastoV6, cartao: 'x'.repeat(31) }] },
    ],
    [
      'cartão com bidi',
      { ...completa, gastos: [{ ...gastoV6, cartao: 'Nu‮bank' }] },
    ],
    [
      'categoria de entrada inválida',
      { ...completa, entradas: [{ ...entrada, categoria: 'lazer' }] },
    ],
    [
      'mesFatura mal formado',
      { ...completa, entradas: [{ ...entrada, mesFatura: '11/2026' }] },
    ],
    [
      'quantidade 1',
      { ...completa, parcelamentos: [{ ...parcelamento, quantidade: 1 }] },
    ],
    [
      'quantidade 49',
      { ...completa, parcelamentos: [{ ...parcelamento, quantidade: 49 }] },
    ],
    [
      '6 parcelamentos',
      { ...completa, parcelamentos: Array(6).fill(parcelamento) },
    ],
    [
      'fatura sem valorReais',
      { ...completa, fatura: { cartao: null, mes: null } },
    ],
    [
      'fatura com valor negativo',
      { ...completa, fatura: { cartao: null, mes: null, valorReais: -1 } },
    ],
    ['intenção desconhecida', { ...completa, intencao: 'apagar' }],
  ])('recusa %s', (_n, v) => expect(ok(v)).toBe(false));

  it('áudio exige transcricao', () => {
    expect(respostaInterpretacaoAudioSchemaV6.safeParse(completa).success).toBe(
      false,
    );
    expect(
      respostaInterpretacaoAudioSchemaV6.safeParse({
        ...completa,
        transcricao: 'oi',
      }).success,
    ).toBe(true);
  });
});

describe('schema de correção', () => {
  const alteracao = {
    indice: 1,
    valorReais: 40,
    categoria: null,
    descricao: null,
    data: null,
    cartao: null,
    formaPagamento: null,
    removerCartao: false,
  };
  const base = { alteracoes: [alteracao], remover: [2], acrescentar: [] };
  const ok = (v: unknown) => respostaCorrecaoSchema.safeParse(v).success;

  it('aceita resposta completa', () => expect(ok(base)).toBe(true));
  it.each([
    ['campo extra', { ...base, x: 1 }],
    [
      'alteração sem removerCartao',
      {
        ...base,
        alteracoes: [{ ...alteracao, removerCartao: undefined }],
      },
    ],
    [
      'campo extra na alteração',
      { ...base, alteracoes: [{ ...alteracao, x: 1 }] },
    ],
    ['índice 0', { ...base, remover: [0] }],
    [
      'acrescentar sem cartao',
      {
        ...base,
        acrescentar: [
          {
            valorReais: 1,
            categoria: 'outros',
            descricao: 'x',
            dataGasto: '2026-10-01',
          },
        ],
      },
    ],
  ])('recusa %s', (_n, v) => expect(ok(v)).toBe(false));

  it('áudio exige transcricao', () => {
    expect(respostaCorrecaoAudioSchema.safeParse(base).success).toBe(false);
    expect(
      respostaCorrecaoAudioSchema.safeParse({ ...base, transcricao: 'x' })
        .success,
    ).toBe(true);
  });
});

describe('JSON Schema v6 e de correção', () => {
  it('sem $schema nem escapes \\p{...}', () => {
    for (const s of [
      respostaInterpretacaoJsonSchemaV6,
      respostaInterpretacaoAudioJsonSchemaV6,
      respostaCorrecaoJsonSchema,
      respostaCorrecaoAudioJsonSchema,
    ]) {
      expect(s).not.toHaveProperty('$schema');
      expect(JSON.stringify(s)).not.toContain('\\\\p{');
    }
  });

  // O Gemini devolve 400 INVALID_ARGUMENT quando o schema v6 completo leva
  // restrições de valor (complexidade demais); a resposta segue validada pelo zod.
  it.each([
    ['v6 texto', respostaInterpretacaoJsonSchemaV6],
    ['v6 áudio', respostaInterpretacaoAudioJsonSchemaV6],
    ['correção texto', respostaCorrecaoJsonSchema],
    ['correção áudio', respostaCorrecaoAudioJsonSchema],
  ])('%s não envia restrições de valor ao Gemini', (_n, s) => {
    expect(palavrasChave(s)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(pattern|minLength|maxLength|minimum|maximum|minItems|maxItems)$/,
        ),
      ]),
    );
    expect(palavrasChave(s)).toEqual(
      expect.arrayContaining(['required', 'description', 'enum']),
    );
  });
});

/** Palavras-chave de JSON Schema usadas em qualquer nível (ignora nomes de propriedades). */
function palavrasChave(s: unknown): string[] {
  if (Array.isArray(s)) return s.flatMap(palavrasChave);
  if (!s || typeof s !== 'object') return [];
  return Object.entries(s).flatMap(([k, v]) => [
    k,
    ...(k === 'properties'
      ? Object.values(v as object).flatMap(palavrasChave)
      : palavrasChave(v)),
  ]);
}
