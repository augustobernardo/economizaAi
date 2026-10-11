import { Cartao, normalizarNomeCartao } from '../../domain/cartao.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import { CartaoEmUsoError, CartaoNaoCadastradoError } from '../errors.js';
import type { Relogio } from '../ports/relogio.js';

/** Busca pelo nome citado (sem caixa nem acento); ausente → `CartaoNaoCadastradoError`. */
export async function buscarCartaoPorNome(
  cartoes: CartaoRepository,
  nome: string,
): Promise<Cartao> {
  const cartao = await cartoes.buscarPorNome(normalizarNomeCartao(nome));
  if (!cartao) throw new CartaoNaoCadastradoError(nome);
  return cartao;
}

export class CadastrarCartaoUseCase {
  constructor(
    private readonly cartoes: CartaoRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar(e: {
    nome: string;
    diaFechamento: number;
    diaVencimento: number;
  }): Promise<Cartao> {
    const cartao = Cartao.criar({ ...e, agora: this.relogio.agora() });
    await this.cartoes.salvar(cartao);
    return cartao;
  }
}

export class ListarCartoesUseCase {
  constructor(private readonly cartoes: CartaoRepository) {}

  executar(): Promise<Cartao[]> {
    return this.cartoes.listar();
  }
}

export class RemoverCartaoUseCase {
  constructor(private readonly cartoes: CartaoRepository) {}

  async executar(nome: string): Promise<Cartao> {
    const cartao = await buscarCartaoPorNome(this.cartoes, nome);
    if ((await this.cartoes.remover(cartao.id)) === 'em-uso')
      throw new CartaoEmUsoError('O cartão ainda tem lançamentos');
    return cartao;
  }
}
