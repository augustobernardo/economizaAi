import { z } from 'zod';
import { CATEGORIAS } from '../../domain/categoria.js';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const gastoSchema = z
  .object({
    valorReais: z.number().min(0.01),
    categoria: z.enum(CATEGORIAS),
    descricao: z.string().trim().min(1).max(200),
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
  .extend({ transcricao: z.string().trim().max(2000) })
  .strict();

const { $schema: _omitidoAudio, ...jsonSchemaAudio } = z.toJSONSchema(
  respostaInterpretacaoAudioSchema,
);
export const respostaInterpretacaoAudioJsonSchema = jsonSchemaAudio;

export type RespostaInterpretacao = z.infer<typeof respostaInterpretacaoSchema>;
