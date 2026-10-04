import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS,
  normalizarCategoria,
  ROTULOS_CATEGORIA,
} from './categoria.js';

describe('ROTULOS_CATEGORIA', () => {
  it('tem um rótulo para cada categoria, com acento quando cabe', () => {
    expect(Object.keys(ROTULOS_CATEGORIA).sort()).toEqual(
      [...CATEGORIAS].sort(),
    );
    expect(ROTULOS_CATEGORIA.alimentacao).toBe('alimentação');
    expect(ROTULOS_CATEGORIA.saude).toBe('saúde');
    expect(ROTULOS_CATEGORIA.educacao).toBe('educação');
    expect(ROTULOS_CATEGORIA.vestuario).toBe('vestuário');
  });
});

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
