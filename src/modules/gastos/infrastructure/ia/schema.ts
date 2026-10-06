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

export type RespostaInterpretacao = z.infer<typeof respostaInterpretacaoSchema>;
