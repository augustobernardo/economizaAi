import { z } from 'zod';
import { CATEGORIAS } from '../../domain/categoria.js';
import { CATEGORIAS_ENTRADA } from '../../domain/categoria-entrada.js';
import { FORMAS_PAGAMENTO } from '../../domain/gasto.js';

// Recusa controle (Cc) e formatação/bidi (Cf): o texto chega a respostas e exportações.
// Exceção: U+200D (ZWJ), necessário para emoji compostos como 👨‍👩‍👧.
const textoLimpo = /^(?:[^\p{Cc}\p{Cf}]|\u200D)*$/u;
// refine (não regex): toJSONSchema não emite refinements, e o Gemini pode recusar `\p{..}`.
const limpo = (t: string) => textoLimpo.test(t);
const msgTexto = { message: 'texto com caracteres de controle ou bidi' };

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const gastoSchema = z
  .object({
    valorReais: z.number().min(0.01),
    categoria: z.enum(CATEGORIAS),
    descricao: z.string().trim().min(1).max(200).refine(limpo, msgTexto),
    dataGasto: data,
  })
  .strict();

export const respostaInterpretacaoSchema = z
  .object({
    intencao: z.enum(['registrar', 'exportar', 'resumir', 'listarUltimos']),
    gastos: z.array(gastoSchema).max(10),
    inicio: data.nullable(),
    fim: data.nullable(),
  })
  .strict();

// Gemini não aceita a chave `$schema`.
const { $schema: _omitido, ...jsonSchema } = z.toJSONSchema(
  respostaInterpretacaoSchema,
);
export const respostaInterpretacaoJsonSchema = jsonSchema;

export const respostaInterpretacaoAudioSchema = respostaInterpretacaoSchema
  .extend({ transcricao: z.string().trim().max(2000).refine(limpo, msgTexto) })
  .strict();

const { $schema: _omitidoAudio, ...jsonSchemaAudio } = z.toJSONSchema(
  respostaInterpretacaoAudioSchema,
);
export const respostaInterpretacaoAudioJsonSchema = jsonSchemaAudio;

// v5: mesmo contrato, com descrições nos campos (derivado; a validação segue estrita).
const gastoSchemaComDescricoes = gastoSchema
  .extend({
    valorReais: gastoSchema.shape.valorReais.describe(
      'Valor total do gasto em reais, número positivo (quantidade × preço já multiplicada)',
    ),
    categoria: gastoSchema.shape.categoria.describe(
      'Categoria do gasto; use "outros" se nenhuma servir',
    ),
    descricao: gastoSchema.shape.descricao.describe(
      'Descrição curta do que foi comprado',
    ),
    dataGasto: data.describe('Data em que o gasto aconteceu (AAAA-MM-DD)'),
  })
  .strict();

export const respostaInterpretacaoSchemaComDescricoes =
  respostaInterpretacaoSchema
    .extend({
      intencao: respostaInterpretacaoSchema.shape.intencao.describe(
        'O que o usuário quer: registrar gastos, exportar, resumir ou listar os últimos',
      ),
      gastos: z
        .array(gastoSchemaComDescricoes)
        .max(10)
        .describe(
          'Gastos da mensagem; lista vazia fora de "registrar" ou sem gasto',
        ),
      inicio: data
        .nullable()
        .describe(
          'Início do período (AAAA-MM-DD) em exportar/resumir; senão null',
        ),
      fim: data
        .nullable()
        .describe(
          'Fim do período (AAAA-MM-DD) em exportar/resumir; senão null',
        ),
    })
    .strict();

const { $schema: _omitidoV5, ...jsonSchemaV5 } = z.toJSONSchema(
  respostaInterpretacaoSchemaComDescricoes,
);
export const respostaInterpretacaoJsonSchemaV5 = jsonSchemaV5;

const { $schema: _omitidoAudioV5, ...jsonSchemaAudioV5 } = z.toJSONSchema(
  respostaInterpretacaoSchemaComDescricoes
    .extend({
      transcricao: respostaInterpretacaoAudioSchema.shape.transcricao.describe(
        'Transcrição fiel da fala; string vazia se não houver fala',
      ),
    })
    .strict(),
);
export const respostaInterpretacaoAudioJsonSchemaV5 = jsonSchemaAudioV5;

export type RespostaInterpretacao = z.infer<typeof respostaInterpretacaoSchema>;

// ---- v6: cartões, entradas, parcelamentos e faturas (campos sempre presentes; null = não se aplica) ----

const cartao = z.string().trim().min(1).max(30).refine(limpo, msgTexto);
const mes = z.string().regex(/^\d{4}-\d{2}$/);

const gastoSchemaV6 = gastoSchemaComDescricoes
  .extend({
    cartao: cartao
      .nullable()
      .describe('Cartão citado pelo usuário; null se não citou'),
    formaPagamento: z
      .enum(FORMAS_PAGAMENTO)
      .nullable()
      .describe('credito ou debito se o usuário disse; senão null'),
  })
  .strict();

const entradaSchemaV6 = z
  .object({
    valorReais: z.number().min(0.01).describe('Valor recebido em reais'),
    categoria: z.enum(CATEGORIAS_ENTRADA),
    descricao: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(limpo, msgTexto)
      .describe('Descrição curta da entrada'),
    dataEntrada: data.describe('Data em que o dinheiro entrou (AAAA-MM-DD)'),
    cartao: cartao
      .nullable()
      .describe('Cartão de um reembolso na fatura; senão null'),
    mesFatura: mes
      .nullable()
      .describe('Mês da fatura (AAAA-MM) do reembolso; senão null'),
  })
  .strict();

const parcelamentoSchemaV6 = z
  .object({
    descricao: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(limpo, msgTexto)
      .describe('Descrição curta da compra parcelada'),
    categoria: z.enum(CATEGORIAS),
    cartao: cartao.nullable(),
    totalReais: z
      .number()
      .min(0.01)
      .nullable()
      .describe('Valor total da compra; null se só disse a parcela'),
    valorParcelaReais: z
      .number()
      .min(0.01)
      .nullable()
      .describe('Valor de cada parcela, se o usuário disse; senão null'),
    quantidade: z.number().int().min(2).max(48),
    parcelaAtual: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe(
        'Parcela em que está ("estou na 3"); null se acabou de comprar',
      ),
    dataCompra: data.describe('Data da compra (AAAA-MM-DD)'),
  })
  .strict();

export const respostaInterpretacaoSchemaV6 = z
  .object({
    intencao: z.enum([
      'registrar',
      'exportar',
      'resumir',
      'listarUltimos',
      'informarFatura',
      'consultarFatura',
    ]),
    gastos: z.array(gastoSchemaV6).max(10),
    entradas: z.array(entradaSchemaV6).max(10),
    parcelamentos: z.array(parcelamentoSchemaV6).max(5),
    inicio: data.nullable(),
    fim: data.nullable(),
    fatura: z
      .object({
        cartao: cartao.nullable(),
        mes: mes.nullable(),
        valorReais: z.number().min(0).nullable(),
      })
      .strict()
      .nullable()
      .describe('Só em informarFatura/consultarFatura; senão null'),
  })
  .strict();

const transcricaoV6 =
  respostaInterpretacaoAudioSchema.shape.transcricao.describe(
    'Transcrição fiel da fala; string vazia se não houver fala',
  );

export const respostaInterpretacaoAudioSchemaV6 = respostaInterpretacaoSchemaV6
  .extend({ transcricao: transcricaoV6 })
  .strict();

/**
 * Restrições de valor que saem do schema enviado: com elas o schema v6 completo
 * passa do limite de complexidade do Gemini (400 INVALID_ARGUMENT). A resposta
 * continua validada pelo zod, com todas elas.
 */
const RESTRICOES_DE_VALOR = [
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
] as const;

/** JSON Schema enviado ao Gemini: sem `$schema` (recusado) nem restrições de valor. */
const semSchema = (s: z.ZodType) => {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(s, {
    override: ({ jsonSchema }) => {
      for (const chave of RESTRICOES_DE_VALOR) delete jsonSchema[chave];
    },
  });
  return resto;
};

export const respostaInterpretacaoJsonSchemaV6 = semSchema(
  respostaInterpretacaoSchemaV6,
);
export const respostaInterpretacaoAudioJsonSchemaV6 = semSchema(
  respostaInterpretacaoAudioSchemaV6,
);

export type RespostaInterpretacaoV6 = z.infer<
  typeof respostaInterpretacaoSchemaV6
>;

// ---- correção de lançamentos já registrados ----

const alteracaoSchema = z
  .object({
    indice: z.number().int().min(1).describe('Número do item na lista'),
    valorReais: z.number().min(0.01).nullable(),
    categoria: z
      .enum([...new Set([...CATEGORIAS, ...CATEGORIAS_ENTRADA])] as [
        string,
        ...string[],
      ])
      .nullable(),
    descricao: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(limpo, msgTexto)
      .nullable(),
    data: data.nullable(),
    cartao: cartao.nullable(),
    formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
    removerCartao: z
      .boolean()
      .describe('true só se o usuário pediu para tirar o cartão do item'),
  })
  .strict();

export const respostaCorrecaoSchema = z
  .object({
    alteracoes: z
      .array(alteracaoSchema)
      .max(20)
      .describe('Campo null = não muda'),
    remover: z.array(z.number().int().min(1)).max(20),
    acrescentar: z.array(gastoSchemaV6).max(10),
  })
  .strict();

export const respostaCorrecaoAudioSchema = respostaCorrecaoSchema
  .extend({ transcricao: transcricaoV6 })
  .strict();

export const respostaCorrecaoJsonSchema = semSchema(respostaCorrecaoSchema);
export const respostaCorrecaoAudioJsonSchema = semSchema(
  respostaCorrecaoAudioSchema,
);

export type RespostaCorrecao = z.infer<typeof respostaCorrecaoSchema>;
