import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_ENTRADA,
  ROTULOS_CATEGORIA_ENTRADA,
  normalizarCategoriaEntrada,
} from './categoria-entrada.js';

describe('normalizarCategoriaEntrada', () => {
  it('normaliza caixa, espaços e acento', () => {
    expect(normalizarCategoriaEntrada(' Salário ')).toBe('salario');
    expect(normalizarCategoriaEntrada('TRANSFERÊNCIA')).toBe('transferencia');
  });

  it('categoria desconhecida vira outros', () => {
    expect(normalizarCategoriaEntrada('herança')).toBe('outros');
  });

  it('tem rótulo para toda categoria', () => {
    for (const c of CATEGORIAS_ENTRADA) {
      expect(ROTULOS_CATEGORIA_ENTRADA[c]).toBeTruthy();
    }
    expect(ROTULOS_CATEGORIA_ENTRADA.salario).toBe('salário');
  });
});
