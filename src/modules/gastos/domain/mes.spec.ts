import { describe, expect, it } from 'vitest';
import {
  diaNoMes,
  ehMesValido,
  formatarMesCurto,
  mesDe,
  mesesEntre,
  somarMeses,
} from './mes.js';

describe('mes', () => {
  it('soma meses com virada de ano', () => {
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
    expect(somarMeses('2027-01', -1)).toBe('2026-12');
    expect(somarMeses('2026-10', 0)).toBe('2026-10');
  });
  it('extrai o mês da data', () => expect(mesDe('2026-10-15')).toBe('2026-10'));
  it('valida formato e faixa', () => {
    expect(ehMesValido('2026-12')).toBe(true);
    expect(ehMesValido('2026-13')).toBe(false);
    expect(ehMesValido('26-1')).toBe(false);
  });
  it('formata curto', () =>
    expect(formatarMesCurto('2026-11')).toBe('nov/2026'));
  it('limita o dia ao último do mês', () => {
    expect(diaNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(diaNoMes('2028-02', 30)).toBe('2028-02-29');
    expect(diaNoMes('2026-10', 3)).toBe('2026-10-03');
  });
  it('diferença em meses', () => {
    expect(mesesEntre('2026-10', '2027-01')).toBe(3);
    expect(mesesEntre('2026-10', '2026-10')).toBe(0);
  });
});
