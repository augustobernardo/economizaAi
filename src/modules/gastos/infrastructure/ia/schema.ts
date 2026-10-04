import { z } from 'zod';
import { CATEGORIAS } from '../../domain/categoria.js';

export const respostaExtracaoSchema = z
  .object({
    gastos: z
      .array(
        z
          .object({
            valorReais: z.number().min(0.01),
            categoria: z.enum(CATEGORIAS),
            descricao: z.string().trim().min(1).max(200),
            dataGasto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

// Gemini não aceita a chave `$schema`.
const { $schema: _omitido, ...jsonSchema } = z.toJSONSchema(
  respostaExtracaoSchema,
);
export const respostaExtracaoJsonSchema = jsonSchema;

export const respostaExtracaoAudioSchema = respostaExtracaoSchema
  .extend({ transcricao: z.string().trim().max(2000) })
  .strict();

const { $schema: _omitidoAudio, ...jsonSchemaAudio } = z.toJSONSchema(
  respostaExtracaoAudioSchema,
);
export const respostaExtracaoAudioJsonSchema = jsonSchemaAudio;

export type RespostaExtracao = z.infer<typeof respostaExtracaoSchema>;
