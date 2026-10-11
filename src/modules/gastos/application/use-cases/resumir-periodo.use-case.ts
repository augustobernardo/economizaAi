import type { Cartao } from '../../domain/cartao.js';
import { mesDe, somarMeses } from '../../domain/mes.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { EntradaRepository } from '../../domain/ports/entrada.repository.js';
import type { FaturaRepository } from '../../domain/ports/fatura.repository.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import type { ParcelamentoRepository } from '../../domain/ports/parcelamento.repository.js';
import {
  resumirPeriodo,
  type ResumoDoPeriodo,
} from '../../domain/resumo-do-periodo.js';
import { NenhumGastoNoPeriodoError } from '../errors.js';
import type { DadosDoPeriodo } from '../ports/exportador.js';
import type { Relogio } from '../ports/relogio.js';
import type { CompositorDeFatura } from './faturas.use-cases.js';
import { resolverPeriodo, type PedidoDePeriodo } from './pedido-de-periodo.js';

/** Meses `AAAA-MM`, sem repetição, de `inicio` a `fim` (datas civis). */
function mesesDoIntervalo(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  for (let m = mesDe(inicio); m <= mesDe(fim); m = somarMeses(m, 1)) {
    meses.push(m);
  }
  return meses;
}

export class ResumirPeriodoUseCase {
  constructor(
    private readonly gastos: GastoRepository,
    private readonly entradas: EntradaRepository,
    private readonly parcelamentos: ParcelamentoRepository,
    private readonly cartoes: CartaoRepository,
    private readonly faturas: FaturaRepository,
    private readonly compositor: CompositorDeFatura,
    private readonly relogio: Relogio,
  ) {}

  async executar(
    pedido: PedidoDePeriodo,
  ): Promise<Pick<DadosDoPeriodo, 'periodo' | 'resumo' | 'cartoes'>> {
    const { periodo, resumo, cartoes } = await this.carregar(pedido);
    return { periodo, resumo, cartoes };
  }

  /** Dados completos do período, para quem precisa dos lançamentos (exportação). */
  async carregar(pedido: PedidoDePeriodo): Promise<DadosDoPeriodo> {
    const periodo = resolverPeriodo(pedido, this.relogio.agora());
    const [gastos, entradas, parcelamentos, todosCartoes] = await Promise.all([
      this.gastos.listarPorPeriodo(periodo.inicio, periodo.fimExclusivo),
      this.entradas.listarPorPeriodo(periodo.inicio, periodo.fimExclusivo),
      this.parcelamentos.listarTodos(),
      this.cartoes.listar(),
    ]);
    const meses = mesesDoIntervalo(periodo.inicio, periodo.fim);
    const resumo = resumirPeriodo({
      meses,
      gastos,
      entradas,
      parcelamentos,
      faturas: await this.faturasDoPeriodo(todosCartoes, meses, periodo),
    });
    if (resumo === null) throw new NenhumGastoNoPeriodoError(periodo);

    return {
      periodo,
      resumo,
      gastos,
      entradas,
      cartoes: new Map(todosCartoes.map((c) => [c.id, c])),
    };
  }

  /** Faturas que vencem no período; some a que está zerada e sem valor inicial informado. */
  private async faturasDoPeriodo(
    cartoes: readonly Cartao[],
    meses: readonly string[],
    periodo: DadosDoPeriodo['periodo'],
  ): Promise<ResumoDoPeriodo['faturas']> {
    const alvos = cartoes.flatMap((cartao) =>
      meses
        .filter((m) => {
          const vencimento = cartao.vencimentoDe(m);
          return vencimento >= periodo.inicio && vencimento <= periodo.fim;
        })
        .map((mes) => ({ cartao, mes })),
    );
    const faturas = await Promise.all(
      alvos.map(async ({ cartao, mes }) => {
        const [composicao, informada] = await Promise.all([
          this.compositor.compor(cartao, mes),
          this.faturas.buscar(cartao.id, mes),
        ]);
        return { cartaoNome: cartao.nome, composicao, informada };
      }),
    );
    return faturas
      .filter((f) => f.composicao.totalCentavos > 0 || f.informada !== null)
      .map(({ cartaoNome, composicao }) => ({ cartaoNome, composicao }));
  }
}
