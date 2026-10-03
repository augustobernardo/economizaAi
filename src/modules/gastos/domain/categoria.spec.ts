import { describe, expect, it } from 'vitest';
import { CATEGORIAS, normalizarCategoria } from './categoria.js';

describe('CATEGORIAS', () => {
  it('é a lista fechada de categorias do roadmap', () => {
    expect(CATEGORIAS).toEqual([
      'alimentacao',
      'mercado',
      'transporte',
      'moradia',
      'saude',
      'lazer',
      'educacao',
      'assinaturas',
      'vestuario',
      'outros',
    ]);
  });
});

describe('normalizarCategoria', () => {
  it.each(CATEGORIAS)('mantém %s já normalizada', (categoria) => {
    expect(normalizarCategoria(categoria)).toBe(categoria);
  });

  it('ignora acentuação e caixa', () => {
    expect(normalizarCategoria('Saúde')).toBe('saude');
    expect(normalizarCategoria('Alimentação')).toBe('alimentacao');
  });

  it('ignora espaços nas bordas', () => {
    expect(normalizarCategoria('  mercado  ')).toBe('mercado');
  });

  it('reconhece sinônimos mínimos', () => {
    expect(normalizarCategoria('Supermercado')).toBe('mercado');
  });

  it('valor desconhecido vira outros', () => {
    expect(normalizarCategoria('viagem')).toBe('outros');
    expect(normalizarCategoria('')).toBe('outros');
  });
});
