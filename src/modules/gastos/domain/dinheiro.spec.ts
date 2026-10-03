import { describe, expect, it } from 'vitest';
import { Dinheiro } from './dinheiro.js';
import { ValorInvalidoError } from './errors.js';

describe('Dinheiro.deCentavos', () => {
  it('cria a partir de um inteiro positivo', () => {
    expect(Dinheiro.deCentavos(5000).centavos).toBe(5000);
  });

  it('rejeita zero', () => {
    expect(() => Dinheiro.deCentavos(0)).toThrow(ValorInvalidoError);
  });

  it('rejeita negativo', () => {
    expect(() => Dinheiro.deCentavos(-100)).toThrow(ValorInvalidoError);
  });

  it('rejeita não inteiro', () => {
    expect(() => Dinheiro.deCentavos(10.5)).toThrow(ValorInvalidoError);
  });
});

describe('Dinheiro.deReais', () => {
  it('converte reais inteiros em centavos', () => {
    expect(Dinheiro.deReais(50).centavos).toBe(5000);
  });

  it('converte reais com casas decimais sem erro de ponto flutuante', () => {
    expect(Dinheiro.deReais(19.9).centavos).toBe(1990);
  });

  it('rejeita zero', () => {
    expect(() => Dinheiro.deReais(0)).toThrow(ValorInvalidoError);
  });

  it('rejeita negativo', () => {
    expect(() => Dinheiro.deReais(-5)).toThrow(ValorInvalidoError);
  });

  it('rejeita NaN', () => {
    expect(() => Dinheiro.deReais(NaN)).toThrow(ValorInvalidoError);
  });

  it('rejeita Infinity', () => {
    expect(() => Dinheiro.deReais(Infinity)).toThrow(ValorInvalidoError);
  });
});

describe('Dinheiro.deReais (arredondamento e faixa)', () => {
  it('arredonda meio centavo para cima mesmo quando o float fica abaixo (1.005)', () => {
    expect(Dinheiro.deReais(1.005).centavos).toBe(101);
  });

  it('rejeita valores além da faixa de inteiros seguros', () => {
    expect(() => Dinheiro.deReais(1e21)).toThrow(ValorInvalidoError);
    expect(() => Dinheiro.deCentavos(2 ** 53)).toThrow(ValorInvalidoError);
  });
});

describe('Dinheiro.deTexto', () => {
  it.each([
    ['50,90', 5090],
    ['1.234,56', 123456],
    ['50', 5000],
    ['R$ 12,30', 1230],
    ['R$12,30', 1230],
  ])('converte %s em %i centavos', (texto, centavosEsperados) => {
    expect(Dinheiro.deTexto(texto).centavos).toBe(centavosEsperados);
  });

  it.each([[''], ['abc'], ['-5'], ['0'], ['12,345']])('rejeita %s', (texto) => {
    expect(() => Dinheiro.deTexto(texto)).toThrow(ValorInvalidoError);
  });
});

describe('Dinheiro.somar', () => {
  it('soma os centavos de dois valores', () => {
    const total = Dinheiro.deReais(10).somar(Dinheiro.deReais(5.5));

    expect(total.centavos).toBe(1550);
  });
});

describe('Dinheiro.formatar', () => {
  it('formata em reais com separador decimal brasileiro', () => {
    expect(Dinheiro.deReais(50.9).formatar()).toBe('R$ 50,90');
  });

  it('formata milhares com ponto', () => {
    expect(Dinheiro.deTexto('1.234,56').formatar()).toBe('R$ 1.234,56');
  });
});

describe('Dinheiro.equals', () => {
  it('é true para o mesmo valor em centavos', () => {
    expect(Dinheiro.deReais(10).equals(Dinheiro.deCentavos(1000))).toBe(true);
  });

  it('é false para valores diferentes', () => {
    expect(Dinheiro.deReais(10).equals(Dinheiro.deReais(11))).toBe(false);
  });
});
