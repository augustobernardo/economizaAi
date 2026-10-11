import type { Entrada } from '../entrada.js';
import type { Gasto } from '../gasto.js';
import type { Parcelamento } from '../parcelamento.js';

export interface ItensDoRegistro {
  gastos: Gasto[];
  entradas: Entrada[];
  parcelamentos: Parcelamento[];
}

/** Operações que cruzam gastos, entradas e parcelamentos: sempre tudo ou nada. */
export interface RegistroRepository {
  salvar(itens: ItensDoRegistro): Promise<void>;
  /** Remove dos três tipos os itens do registro com `criadoEm >= criadoDesde`; devolve a soma. */
  desfazer(registroId: string, criadoDesde: Date): Promise<number>;
  carregar(registroId: string): Promise<ItensDoRegistro>;
  /** Aplica remover, atualizar e inserir numa transação; `Gasto`/`Entrada` por `instanceof`. */
  aplicarEdicao(e: {
    atualizar: (Gasto | Entrada)[];
    remover: (Gasto | Entrada)[];
    inserir: (Gasto | Entrada)[];
  }): Promise<void>;
}

export const REGISTRO_REPOSITORY = Symbol('REGISTRO_REPOSITORY');
