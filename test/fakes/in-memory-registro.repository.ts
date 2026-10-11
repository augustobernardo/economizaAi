import {
  CartaoNaoEncontradoError,
  RegistroAlteradoError,
} from '../../src/modules/gastos/application/errors.js';
import { Entrada } from '../../src/modules/gastos/domain/entrada.js';
import {
  Gasto,
  TETO_VALOR_CENTAVOS,
} from '../../src/modules/gastos/domain/gasto.js';
import type { Parcelamento } from '../../src/modules/gastos/domain/parcelamento.js';
import type {
  ItensDoRegistro,
  RegistroRepository,
} from '../../src/modules/gastos/domain/ports/registro.repository.js';
import type { InMemoryCartaoRepository } from './in-memory-cartao.repository.js';
import type { InMemoryEntradaRepository } from './in-memory-entrada.repository.js';
import type { InMemoryGastoRepository } from './in-memory-gasto.repository.js';
import type { InMemoryParcelamentoRepository } from './in-memory-parcelamento.repository.js';

/** Simula os CHECKs de teto do banco, para a gravação ser tudo-ou-nada como a real. */
function validar(item: Gasto | Entrada | Parcelamento): void {
  const total =
    item instanceof Gasto || item instanceof Entrada
      ? item.valor.centavos
      : item.total.centavos;
  if (total > TETO_VALOR_CENTAVOS)
    throw new Error('CHECK violado: valor acima do teto');
}

export class InMemoryRegistroRepository implements RegistroRepository {
  constructor(
    private readonly gastos: InMemoryGastoRepository,
    private readonly entradas: InMemoryEntradaRepository,
    private readonly parcelamentos: InMemoryParcelamentoRepository,
    private readonly cartoes: InMemoryCartaoRepository,
  ) {}

  /** Simula a FK para `cartoes`. */
  private async validarCartao(
    item: Gasto | Entrada | Parcelamento,
  ): Promise<void> {
    const cartaoId =
      item instanceof Gasto
        ? item.pagamento?.cartaoId
        : item instanceof Entrada
          ? item.vinculo?.cartaoId
          : item.cartaoId;
    if (cartaoId !== undefined && !(await this.cartoes.buscarPorId(cartaoId)))
      throw new CartaoNaoEncontradoError('Cartão não encontrado');
  }

  async salvar(itens: ItensDoRegistro): Promise<void> {
    const todos = [...itens.gastos, ...itens.entradas, ...itens.parcelamentos];
    todos.forEach(validar);
    for (const item of todos) await this.validarCartao(item);
    await this.gastos.salvarVarios(itens.gastos);
    await this.entradas.salvarVarios(itens.entradas);
    await this.parcelamentos.salvarVarios(itens.parcelamentos);
  }

  async desfazer(registroId: string, criadoDesde: Date): Promise<number> {
    const quantidades = await Promise.all([
      this.gastos.removerDoRegistro(registroId, criadoDesde),
      this.entradas.removerDoRegistro(registroId, criadoDesde),
      this.parcelamentos.removerDoRegistro(registroId, criadoDesde),
    ]);
    return quantidades.reduce((soma, n) => soma + n, 0);
  }

  async carregar(registroId: string): Promise<ItensDoRegistro> {
    return {
      gastos: await this.gastos.doRegistro(registroId),
      entradas: await this.entradas.doRegistro(registroId),
      parcelamentos: await this.parcelamentos.doRegistro(registroId),
    };
  }

  async aplicarEdicao(e: {
    atualizar: (Gasto | Entrada)[];
    remover: (Gasto | Entrada)[];
    inserir: (Gasto | Entrada)[];
  }): Promise<void> {
    [...e.atualizar, ...e.inserir].forEach(validar);
    for (const item of [...e.atualizar, ...e.inserir])
      await this.validarCartao(item);
    // Simula `affected === 1`: id inexistente aborta antes de gravar qualquer coisa.
    for (const item of [...e.atualizar, ...e.remover]) {
      const colecao = item instanceof Gasto ? this.gastos : this.entradas;
      if (!colecao.tem(item.id))
        throw new RegistroAlteradoError('Registro alterado ou apagado');
    }
    for (const item of e.remover) {
      await (item instanceof Gasto ? this.gastos : this.entradas).removerPorId(
        item.id,
      );
    }
    for (const item of e.atualizar) {
      if (item instanceof Gasto) await this.gastos.atualizar(item);
      else await this.entradas.atualizar(item);
    }
    await this.gastos.salvarVarios(e.inserir.filter((i) => i instanceof Gasto));
    await this.entradas.salvarVarios(
      e.inserir.filter((i) => i instanceof Entrada),
    );
  }
}
