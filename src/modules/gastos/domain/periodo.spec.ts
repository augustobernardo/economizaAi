import { describe, expect, it } from 'vitest';
import {
  DataInvalidaError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
} from './errors.js';
import { Periodo } from './periodo.js';

const HOJE = '2026-10-04';

describe('Periodo', () => {
  it('dia único', () => {
    const p = Periodo.criar('2026-10-04', '2026-10-04', HOJE);
    expect([
      p.inicio,
      p.fim,
      p.tipo,
      p.descrever(),
      p.slug,
      p.fimExclusivo,
    ]).toEqual([
      '2026-10-04',
      '2026-10-04',
      'dia',
      '04/10/2026',
      '2026-10-04',
      '2026-10-05',
    ]);
  });
  it('início hoje com fim no futuro vira dia único', () => {
    const p = Periodo.criar('2026-10-04', '2026-10-10', HOJE);
    expect([p.tipo, p.descrever(), p.slug]).toEqual([
      'dia',
      '04/10/2026',
      '2026-10-04',
    ]);
  });
  it('mês pedido inteiro continua mês mesmo cortado no dia 1', () => {
    const p = Periodo.criar('2026-10-01', '2026-10-31', '2026-10-01');
    expect([p.tipo, p.fim, p.slug]).toEqual(['mes', '2026-10-01', '2026-10']);
  });
  it('mês inteiro no passado', () => {
    const p = Periodo.criar('2026-08-01', '2026-08-31', HOJE);
    expect([p.tipo, p.descrever(), p.slug]).toEqual([
      'mes',
      'agosto de 2026',
      '2026-08',
    ]);
  });
  it('mês atual: fim cortado em hoje, continua sendo "mês"', () => {
    const p = Periodo.criar('2026-10-01', '2026-10-31', HOJE);
    expect([p.fim, p.tipo, p.descrever(), p.slug]).toEqual([
      '2026-10-04',
      'mes',
      'outubro de 2026',
      '2026-10',
    ]);
  });
  it('intervalo', () => {
    const p = Periodo.criar('2026-09-01', '2026-09-15', HOJE);
    expect([p.tipo, p.descrever(), p.slug]).toEqual([
      'intervalo',
      '01/09/2026 a 15/09/2026',
      '2026-09-01_a_2026-09-15',
    ]);
  });
  it('fevereiro de ano não bissexto é mês', () => {
    expect(Periodo.criar('2026-02-01', '2026-02-28', HOJE).tipo).toBe('mes');
  });
  it('início depois do fim → PeriodoInvertidoError', () => {
    expect(() => Periodo.criar('2026-09-15', '2026-09-01', HOJE)).toThrow(
      PeriodoInvertidoError,
    );
  });
  it('início no futuro → PeriodoFuturoError', () => {
    expect(() => Periodo.criar('2026-10-05', '2026-10-31', HOJE)).toThrow(
      PeriodoFuturoError,
    );
  });
  it('366 dias é o máximo (inclusivo)', () => {
    expect(() => Periodo.criar('2025-10-04', '2026-10-04', HOJE)).not.toThrow();
    expect(() => Periodo.criar('2025-10-03', '2026-10-04', HOJE)).toThrow(
      PeriodoLongoDemaisError,
    );
  });
  it('limite de 366 dias é medido depois do corte em hoje', () => {
    expect(() => Periodo.criar('2025-10-04', '2026-12-31', HOJE)).not.toThrow();
  });
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-10-01', 'x'],
  ])('data inválida %s..%s → DataInvalidaError', (i, f) => {
    expect(() => Periodo.criar(i, f, HOJE)).toThrow(DataInvalidaError);
  });
  it('doMes(0) e doMes(-1)', () => {
    const atual = Periodo.doMes(HOJE, 0);
    const anterior = Periodo.doMes(HOJE, -1);
    expect([atual.inicio, atual.fim, atual.descrever()]).toEqual([
      '2026-10-01',
      '2026-10-04',
      'outubro de 2026',
    ]);
    expect([anterior.inicio, anterior.fim, anterior.descrever()]).toEqual([
      '2026-09-01',
      '2026-09-30',
      'setembro de 2026',
    ]);
  });
  it('doMes(-1) em janeiro volta para dezembro do ano anterior', () => {
    expect(Periodo.doMes('2026-01-10', -1).descrever()).toBe(
      'dezembro de 2025',
    );
  });
});
