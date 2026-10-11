import { normalizarTexto } from './categoria.js';

export const CATEGORIAS_ENTRADA = [
  'salario',
  'transferencia',
  'reembolso',
  'rendimento',
  'venda',
  'outros',
] as const;

export type CategoriaEntrada = (typeof CATEGORIAS_ENTRADA)[number];

/** Nome de cada categoria como o usuário lê (com acento). */
export const ROTULOS_CATEGORIA_ENTRADA: Record<CategoriaEntrada, string> = {
  salario: 'salário',
  transferencia: 'transferência',
  reembolso: 'reembolso',
  rendimento: 'rendimento',
  venda: 'venda',
  outros: 'outros',
};

/** Categoria desconhecida vira `'outros'` em vez de rejeitar a extração da IA. */
export function normalizarCategoriaEntrada(valor: string): CategoriaEntrada {
  const normalizado = normalizarTexto(valor);
  return CATEGORIAS_ENTRADA.find((c) => c === normalizado) ?? 'outros';
}
