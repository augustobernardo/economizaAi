import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.object({ texto: z.string().trim().min(1).max(500) }).strict(),
);

describe('ZodValidationPipe', () => {
  it('aceita corpo válido', () => {
    expect(pipe.transform({ texto: 'gastei 50' })).toEqual({
      texto: 'gastei 50',
    });
  });

  it.each([
    ['vazio após trim', { texto: '   ' }],
    ['longo demais', { texto: 'a'.repeat(501) }],
    ['campo extra', { texto: 'x', extra: 1 }],
    ['sem campo', {}],
  ])('rejeita %s', (_nome, corpo) => {
    expect(() => pipe.transform(corpo)).toThrow(BadRequestException);
  });
});
