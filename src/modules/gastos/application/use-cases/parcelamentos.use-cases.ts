import type { Cartao } from '../../domain/cartao.js';
import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { mesDe } from '../../domain/mes.js';
import type { Parcela, Parcelamento } from '../../domain/parcelamento.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { ParcelamentoRepository } from '../../domain/ports/parcelamento.repository.js';
import { CartaoNaoEncontradoError } from '../errors.js';
import type { Relogio } from '../ports/relogio.js';

export class ListarParcelamentosUseCase {
  constructor(
    private readonly parcelamentos: ParcelamentoRepository,
    private readonly cartoes: CartaoRepository,
    private readonly relogio: Relogio,
  ) {}

  /** Ativo = com parcela na competência atual ou em alguma futura. */
  async executar(): Promise<
    {
      parcelamento: Parcelamento;
      cartao: Cartao;
      atual: Parcela | null;
      restantes: number;
    }[]
  > {
    const mesAtual = mesDe(hojeEmSaoPaulo(this.relogio.agora()));
    const porId = new Map((await this.cartoes.listar()).map((c) => [c.id, c]));
    return (await this.parcelamentos.listarTodos())
      .filter((p) => p.ultimoMesCompetencia >= mesAtual)
      .map((parcelamento) => {
        const cartao = porId.get(parcelamento.cartaoId);
        if (!cartao)
          throw new CartaoNaoEncontradoError(
            'Cartão do parcelamento não existe',
          );
        const atual = parcelamento.parcelaNoMes(mesAtual);
        return {
          parcelamento,
          cartao,
          atual,
          restantes:
            parcelamento.quantidade -
            (atual?.numero ?? parcelamento.parcelaInicial - 1),
        };
      });
  }
}

export class RemoverParcelamentoUseCase {
  constructor(private readonly parcelamentos: ParcelamentoRepository) {}

  executar(id: string): Promise<boolean> {
    return this.parcelamentos.remover(id);
  }
}
