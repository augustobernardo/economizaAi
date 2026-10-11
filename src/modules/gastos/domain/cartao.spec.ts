import { describe, expect, it } from 'vitest';
import { Cartao, normalizarNomeCartao } from './cartao.js';
import { somarDias } from './data-civil.js';
import { DiaInvalidoError, NomeDeCartaoInvalidoError } from './errors.js';
import { somarMeses } from './mes.js';

const agora = new Date('2026-10-10T12:00:00Z');
const cartao = (f: number, v: number, nome = 'Inter') =>
  Cartao.criar({ nome, diaFechamento: f, diaVencimento: v, agora });

describe('Cartao', () => {
  it('normaliza nome sem acento, caixa e espaços duplicados', () => {
    expect(normalizarNomeCartao('  ÍNTER  Black ')).toBe('inter black');
  });
  it('recusa nome vazio, longo ou com controle', () => {
    expect(() => cartao(3, 10, '  ')).toThrow(NomeDeCartaoInvalidoError);
    expect(() => cartao(3, 10, 'x'.repeat(31))).toThrow(
      NomeDeCartaoInvalidoError,
    );
    expect(() => cartao(3, 10, 'In\nter')).toThrow(NomeDeCartaoInvalidoError);
    expect(() => cartao(3, 10, 'In‮ter')).toThrow(NomeDeCartaoInvalidoError);
    for (const n of ['In<ter', 'Inter>', 'In＜ter'])
      expect(() => cartao(3, 10, n)).toThrow(NomeDeCartaoInvalidoError);
  });
  it('recusa dia fora de 1..31', () => {
    expect(() => cartao(0, 10)).toThrow(DiaInvalidoError);
    expect(() => cartao(3, 32)).toThrow(DiaInvalidoError);
    expect(() => cartao(3.5, 10)).toThrow(DiaInvalidoError);
  });

  describe('mesDaFatura (fecha 3, vence 10)', () => {
    const c = cartao(3, 10);
    it('compra no dia do fechamento entra no ciclo que fecha nele', () =>
      expect(c.mesDaFatura('2026-10-03')).toBe('2026-10'));
    it('compra depois do fechamento vai para o ciclo seguinte', () =>
      expect(c.mesDaFatura('2026-10-15')).toBe('2026-11'));
    it('virada de ano', () =>
      expect(c.mesDaFatura('2026-12-20')).toBe('2027-01'));
  });
  it('vencimento antes do fechamento no calendário (fecha 25, vence 5)', () => {
    const c = cartao(25, 5);
    expect(c.mesDaFatura('2026-10-20')).toBe('2026-11');
    expect(c.mesDaFatura('2026-10-26')).toBe('2026-12');
  });
  it('fechamento 31 em fevereiro usa o último dia', () => {
    const c = cartao(31, 5);
    expect(c.mesDaFatura('2026-02-28')).toBe('2026-03');
    expect(c.mesDaFatura('2026-03-01')).toBe('2026-04');
  });
  it('fecha e vence no mesmo dia vai para o mês seguinte', () => {
    expect(cartao(10, 10).mesDaFatura('2026-10-05')).toBe('2026-11');
  });
  it('vencimentoDe ajusta ao último dia', () => {
    expect(cartao(25, 31).vencimentoDe('2027-02')).toBe('2027-02-28');
  });
  it('proximaFaturaEmAberto: primeiro vencimento depois de hoje', () => {
    const c = cartao(3, 10);
    expect(c.proximaFaturaEmAberto('2026-10-09')).toBe('2026-10');
    expect(c.proximaFaturaEmAberto('2026-10-10')).toBe('2026-11');
    expect(c.proximaFaturaEmAberto('2026-12-31')).toBe('2027-01');
  });

  describe('cicloDaFatura', () => {
    it('fecha 3 vence 10', () =>
      expect(cartao(3, 10).cicloDaFatura('2026-11')).toEqual({
        inicio: '2026-10-04',
        fimExclusivo: '2026-11-04',
      }));
    it('fecha 25 vence 5', () =>
      expect(cartao(25, 5).cicloDaFatura('2026-11')).toEqual({
        inicio: '2026-09-26',
        fimExclusivo: '2026-10-26',
      }));
    it('fecha 31 vence 5 (abril fecha dia 30)', () =>
      expect(cartao(31, 5).cicloDaFatura('2026-04')).toEqual({
        inicio: '2026-03-01',
        fimExclusivo: '2026-04-01',
      }));
    const pares: [number, number][] = [
      [3, 10],
      [25, 5],
      [10, 10],
      [31, 5],
      [30, 31],
      [29, 31],
      [28, 30],
      [31, 31],
      [1, 31],
    ];
    it.each(pares)(
      'partição sem buraco nem sobreposição (fecha %i vence %i)',
      (f, v) => {
        const c = cartao(f, v);
        for (let m = '2026-01'; m <= '2027-12'; m = somarMeses(m, 1)) {
          const { inicio, fimExclusivo } = c.cicloDaFatura(m);
          expect(inicio < fimExclusivo).toBe(true);
          for (let d = inicio; d < fimExclusivo; d = somarDias(d, 1))
            expect(c.mesDaFatura(d)).toBe(m);
          if (m < '2027-12')
            expect(c.cicloDaFatura(somarMeses(m, 1)).inicio).toBe(fimExclusivo);
        }
      },
    );
  });
});
