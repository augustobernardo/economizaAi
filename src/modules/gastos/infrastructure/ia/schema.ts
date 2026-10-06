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

export type RespostaExtracao = z.infer<typeof respostaExtracaoSchema>;
