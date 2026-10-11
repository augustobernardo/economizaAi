import { CartaoJaExisteError } from '../../src/modules/gastos/application/errors.js';
import type { Cartao } from '../../src/modules/gastos/domain/cartao.js';
import type { CartaoRepository } from '../../src/modules/gastos/domain/ports/cartao.repository.js';

export class InMemoryCartaoRepository implements CartaoRepository {
  private cartoes: Cartao[] = [];

  /** `emUso` diz se algo aponta para o cartão (o banco real usa as FKs). */
  constructor(
    private readonly emUso: (cartaoId: string) => boolean = () => false,
  ) {}

  async salvar(cartao: Cartao): Promise<void> {
    if (this.cartoes.some((c) => c.nomeNormalizado === cartao.nomeNormalizado))
      throw new CartaoJaExisteError('Já existe um cartão com esse nome');
    this.cartoes.push(cartao);
  }

  async listar(): Promise<Cartao[]> {
    // O banco ordena pela collation; comparação simples aqui: testes não dependem de acento/caixa.
    return [...this.cartoes].sort((a, b) =>
      a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0,
    );
  }

  async buscarPorNome(nomeNormalizado: string): Promise<Cartao | null> {
    return (
      this.cartoes.find((c) => c.nomeNormalizado === nomeNormalizado) ?? null
    );
  }

  async buscarPorId(id: string): Promise<Cartao | null> {
    return this.cartoes.find((c) => c.id === id) ?? null;
  }

  async remover(id: string): Promise<'removido' | 'em-uso'> {
    if (this.emUso(id)) return 'em-uso';
    this.cartoes = this.cartoes.filter((c) => c.id !== id);
    return 'removido';
  }

  limpar(): void {
    this.cartoes = [];
  }
}
