/** Aborta se o banco efetivo não for de teste; testes fazem DELETE/TRUNCATE/undo de migrations. */
export function exigirBancoDeTeste(url: string): void {
  let banco = '';
  try {
    banco = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    // URL inválida cai na recusa abaixo; nunca ecoamos a URL (pode ter senha).
  }
  if (!banco.endsWith('_test')) {
    throw new Error(
      'DATABASE_URL não aponta para um banco de teste (o nome do banco deve terminar em "_test"). Abortando para não apagar dados.',
    );
  }
}
