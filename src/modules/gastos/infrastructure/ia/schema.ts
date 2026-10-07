import { z } from 'zod';
import { CATEGORIAS } from '../../domain/categoria.js';

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
