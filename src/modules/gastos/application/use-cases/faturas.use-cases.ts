import type { Cartao } from '../../domain/cartao.js';
import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { MesInvalidoError } from '../../domain/errors.js';
import {
  comporFatura,
  FaturaInformada,
  type ComposicaoDaFatura,
} from '../../domain/fatura.js';
import { ehMesValido } from '../../domain/mes.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { EntradaRepository } from '../../domain/ports/entrada.repository.js';
import type { FaturaRepository } from '../../domain/ports/fatura.repository.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import type { ParcelamentoRepository } from '../../domain/ports/parcelamento.repository.js';
import {
  EscolhaDeCartaoNecessariaError,
  NenhumCartaoCadastradoError,
} from '../errors.js';
import type { Relogio } from '../ports/relogio.js';
import { buscarCartaoPorNome } from './cartoes.use-cases.js';

/** Monta a composição da fatura de um cartão num mês (vencimento). */
export class CompositorDeFatura {
  constructor(
    private readonly gastos: GastoRepository,
    private readonly parcelamentos: ParcelamentoRepository,
    private readonly entradas: EntradaRepository,
    private readonly faturas: FaturaRepository,
  ) {}

  async compor(cartao: Cartao, mes: string): Promise<ComposicaoDaFatura> {
    const ciclo = cartao.cicloDaFatura(mes);
    const [comprasCredito, todos, reembolsos, informada] = await Promise.all([
      this.gastos.listarCreditoDoCartao(
        cartao.id,
        ciclo.inicio,
        ciclo.fimExclusivo,
      ),
      this.parcelamentos.listarTodos(),
      this.entradas.listarReembolsosDaFatura(cartao.id, mes),
      this.faturas.buscar(cartao.id, mes),
    ]);
    const parcelas = todos
      .filter((p) => p.cartaoId === cartao.id)
      .flatMap((p) => {
        const parcela = p.parcelaNaFatura(mes);
        return parcela ? [{ descricao: p.descricao, ...parcela }] : [];
      });
    return comporFatura({
      cartaoId: cartao.id,
      mes,
      vencimento: cartao.vencimentoDe(mes),
      inicialCentavos: informada?.valorInicial ?? 0,
      comprasCredito,
      parcelas,
      reembolsos: reembolsos.map((r) => r.valor),
    });
  }
}

function mesOuProxima(
  mes: string | null,
  cartao: Cartao,
  relogio: Relogio,
): string {
  if (mes === null)
    return cartao.proximaFaturaEmAberto(hojeEmSaoPaulo(relogio.agora()));
  if (!ehMesValido(mes)) throw new MesInvalidoError(`Mês inválido: "${mes}"`);
  return mes;
}

export class InformarFaturaUseCase {
  constructor(
    private readonly cartoes: CartaoRepository,
    private readonly faturas: FaturaRepository,
    private readonly compositor: CompositorDeFatura,
    private readonly relogio: Relogio,
  ) {}

  async executar(e: {
    cartao: string | null;
    mes: string | null;
    valorReais: number;
  }): Promise<{
    cartao: Cartao;
    fatura: FaturaInformada;
    anterior: FaturaInformada | null;
    composicao: ComposicaoDaFatura;
  }> {
    const cartao = await this.resolverCartao(e.cartao);
    const mes = mesOuProxima(e.mes, cartao, this.relogio);
    const fatura = FaturaInformada.criar({
      cartaoId: cartao.id,
      mes,
      // `Dinheiro.deReais` recusa zero, que aqui é válido; a notação `e2` evita 1.005 * 100.
      valorInicialCentavos: Math.round(Number(`${e.valorReais}e2`)),
      agora: this.relogio.agora(),
    });
    const anterior = await this.faturas.salvar(fatura);
    return {
      cartao,
      fatura,
      anterior,
      composicao: await this.compositor.compor(cartao, mes),
    };
  }

  private async resolverCartao(nome: string | null): Promise<Cartao> {
    if (nome !== null) return buscarCartaoPorNome(this.cartoes, nome);
    const todos = await this.cartoes.listar();
    if (todos.length === 0)
      throw new NenhumCartaoCadastradoError('Nenhum cartão cadastrado');
    if (todos.length > 1)
      throw new EscolhaDeCartaoNecessariaError(todos.map((c) => c.nome));
    return todos[0]!;
  }
}

export class ConsultarFaturaUseCase {
  constructor(
    private readonly cartoes: CartaoRepository,
    private readonly compositor: CompositorDeFatura,
    private readonly relogio: Relogio,
  ) {}

  async executar(e: {
    cartao: string | null;
    mes: string | null;
  }): Promise<{ cartao: Cartao; composicao: ComposicaoDaFatura }[]> {
    const alvos =
      e.cartao !== null
        ? [await buscarCartaoPorNome(this.cartoes, e.cartao)]
        : await this.cartoes.listar();
    if (alvos.length === 0)
      throw new NenhumCartaoCadastradoError('Nenhum cartão cadastrado');
    return Promise.all(
      alvos.map(async (cartao) => ({
        cartao,
        composicao: await this.compositor.compor(
          cartao,
          mesOuProxima(e.mes, cartao, this.relogio),
        ),
      })),
    );
  }
}
