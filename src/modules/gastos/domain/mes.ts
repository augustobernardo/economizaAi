import { ultimoDiaDoMes } from './data-civil.js';

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const PADRAO = /^(\d{4})-(\d{2})$/;

export function ehMesValido(mes: string): boolean {
  const p = PADRAO.exec(mes);
  const m = Number(p?.[2]);
  return !!p && m >= 1 && m <= 12;
}

function partes(mes: string): [number, number] {
  const [a, m] = mes.split('-').map(Number);
  return [a!, m!];
}

export function somarMeses(mes: string, n: number): string {
  const [a, m] = partes(mes);
  const i = a * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export const mesDe = (data: string): string => data.slice(0, 7);

/** `'2026-11'` → `'nov/2026'`. */
export function formatarMesCurto(mes: string): string {
  const [a, m] = partes(mes);
  return `${MESES_CURTOS[m - 1]}/${a}`;
}

/** Data `AAAA-MM-DD` do `dia` no mês, limitado ao último dia dele. */
export function diaNoMes(mes: string, dia: number): string {
  const [a, m] = partes(mes);
  const d = Math.min(dia, ultimoDiaDoMes(a, m));
  return `${mes}-${String(d).padStart(2, '0')}`;
}

/** Diferença em meses `fim - inicio`. */
export function mesesEntre(inicio: string, fim: string): number {
  const [ai, mi] = partes(inicio);
  const [af, mf] = partes(fim);
  return af * 12 + mf - (ai * 12 + mi);
}
