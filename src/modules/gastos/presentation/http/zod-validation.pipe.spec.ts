import { BadRequestException } from '@nestjs/common';
import { TextoSchema } from './dev.controller.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(TextoSchema);

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
