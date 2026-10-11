/** Guarda um valor por pouco tempo (escolha de botão, edição pendente); `obter` devolve null se expirou. */
export interface Pendencias<T> {
  guardar(valor: T): string;
  obter(id: string): T | null;
  descartar(id: string): void;
}

export const PENDENCIAS_DE_REGISTRO = Symbol('PENDENCIAS_DE_REGISTRO');
export const PENDENCIAS_DE_EDICAO = Symbol('PENDENCIAS_DE_EDICAO');
