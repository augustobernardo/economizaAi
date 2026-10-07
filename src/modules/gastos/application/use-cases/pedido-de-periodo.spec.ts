import { describe, expect, it } from 'vitest';
import { PeriodoFuturoError } from '../../domain/errors.js';
import { resolverPeriodo } from './pedido-de-periodo.js';

const AGORA = new Date('2026-10-04T15:00:00Z');

describe('resolverPeriodo', () => {
  it('mesRelativo 0 → do dia 1 até hoje', () => {
    const p = resolverPeriodo({ mesRelativo: 0 }, AGORA);

    expect([p.inicio, p.fim, p.tipo]).toEqual([
      '2026-10-01',
      '2026-10-04',
      'mes',
    ]);
  });

  it('mesRelativo -1 → mês anterior inteiro', () => {
    const p = resolverPeriodo({ mesRelativo: -1 }, AGORA);

    expect([p.inicio, p.fim]).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('intervalo explícito', () => {
    const p = resolverPeriodo(
      { inicio: '2026-10-02', fim: '2026-10-03' },
      AGORA,
    );

    expect([p.inicio, p.fim, p.tipo]).toEqual([
      '2026-10-02',
      '2026-10-03',
      'intervalo',
    ]);
  });

  it('usa o dia de São Paulo, não o UTC', () => {
    const p = resolverPeriodo(
      { mesRelativo: 0 },
      new Date('2026-10-05T01:00:00Z'),
    );

    expect(p.fim).toBe('2026-10-04');
  });

  it('mes AAAA-MM → mês inteiro', () => {
    const p = resolverPeriodo({ mes: '2026-09' }, AGORA);

    expect([p.inicio, p.fim, p.tipo]).toEqual([
      '2026-09-01',
      '2026-09-30',
      'mes',
    ]);
  });

  it('início no futuro → PeriodoFuturoError', () => {
    expect(() =>
      resolverPeriodo({ inicio: '2026-10-05', fim: '2026-10-06' }, AGORA),
    ).toThrow(PeriodoFuturoError);
  });
});
