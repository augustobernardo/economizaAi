export const CATEGORIAS = [
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
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Nome de cada categoria como o usuário lê (com acento). */
export const ROTULOS_CATEGORIA: Record<Categoria, string> = {
  alimentacao: 'alimentação',
  mercado: 'mercado',
  transporte: 'transporte',
  moradia: 'moradia',
  saude: 'saúde',
  lazer: 'lazer',
  educacao: 'educação',
  assinaturas: 'assinaturas',
  vestuario: 'vestuário',
  outros: 'outros',
};

/** Sinônimos óbvios que a IA costuma usar em vez do nome exato da categoria. */
const SINONIMOS: Record<string, Categoria> = {
  supermercado: 'mercado',
};

function normalizarTexto(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Categoria desconhecida vira `'outros'` em vez de rejeitar a extração da IA. */
export function normalizarCategoria(valor: string): Categoria {
  const normalizado = normalizarTexto(valor);

  const categoria = CATEGORIAS.find((c) => c === normalizado);
  if (categoria) return categoria;

  return SINONIMOS[normalizado] ?? 'outros';
}
