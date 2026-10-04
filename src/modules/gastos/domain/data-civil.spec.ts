import { describe, expect, it } from 'vitest';
import {
  diasEntre,
  ehDataCivilValida,
  formatarDataBr,
  hojeEmSaoPaulo,
  somarDias,
  ultimoDiaDoMes,
} from './data-civil.js';

describe('data-civil', () => {
  it('hoje em São Paulo usa o fuso (UTC já virou o dia)', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-05T02:00:00Z'))).toBe('2026-10-04');
  });
  it.each([
    ['2026-02-28', true],
    ['2026-02-29', false],
    ['2024-02-29', true],
    ['2026-13-01', false],
    ['04/10/2026', false],
    ['', false],
  ])('ehDataCivilValida(%s) = %s', (data, esperado) => {
    expect(ehDataCivilValida(data)).toBe(esperado);
  });
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diasEntre', () => {
    expect(diasEntre('2026-10-01', '2026-10-01')).toBe(0);
    expect(diasEntre('2025-10-05', '2026-10-04')).toBe(364);
  });
  it('ultimoDiaDoMes', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2024, 2)).toBe(29);
    expect(ultimoDiaDoMes(2026, 12)).toBe(31);
  });
  it('formatarDataBr', () => {
    expect(formatarDataBr('2026-10-04')).toBe('04/10/2026');
  });
});
