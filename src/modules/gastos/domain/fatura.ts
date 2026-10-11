import type { Dinheiro } from './dinheiro.js';
import {
  MesInvalidoError,
  PagamentoInvalidoError,
  ValorInicialInvalidoError,
} from './errors.js';
import type { Gasto } from './gasto.js';
import { TETO_VALOR_CENTAVOS } from './gasto.js';
import { ehMesValido } from './mes.js';

/** Valor inicial da fatura de um cartão num mês, informado pelo dono. */
export class FaturaInformada {
  private constructor(
    readonly cartaoId: string,
    readonly mes: string,
    readonly valorInicial: number,
    readonly informadaEm: Date,
  ) {}

  static criar(p: {
    cartaoId: string;
    mes: string;
    valorInicialCentavos: number;
    agora: Date;
  }): FaturaInformada {
    if (p.cartaoId.trim() === '')
      throw new PagamentoInvalidoError('cartaoId vazio');
    if (!ehMesValido(p.mes))
      throw new MesInvalidoError(`Mês inválido: "${p.mes}"`);
    const v = p.valorInicialCentavos;
    if (!Number.isSafeInteger(v) || v < 0 || v > TETO_VALOR_CENTAVOS) {
      throw new ValorInicialInvalidoError(`Valor inicial inválido: ${v}`);
    }
    return new FaturaInformada(p.cartaoId, p.mes, v, p.agora);
  }

  static restaurar(p: {
    cartaoId: string;
    mes: string;
    valorInicial: number;
    informadaEm: Date;
  }): FaturaInformada {
    return new FaturaInformada(
      p.cartaoId,
      p.mes,
      p.valorInicial,
      p.informadaEm,
    );
  }
}

export interface ParcelaDaFatura {
  descricao: string;
  numero: number;
  quantidade: number;
  valor: Dinheiro;
}

export interface ComposicaoDaFatura {
  cartaoId: string;
  mes: string;
  vencimento: string;
  inicialCentavos: number;
  compras: { quantidade: number; centavos: number };
  parcelas: ParcelaDaFatura[];
  parcelasCentavos: number;
  reembolsosCentavos: number;
  totalCentavos: number;
  creditoExcedenteCentavos: number;
}

const soma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/** Fatura = inicial + compras no crédito + parcelas − reembolsos (piso 0; sobra vira crédito). */
export function comporFatura(e: {
  cartaoId: string;
  mes: string;
  vencimento: string;
  inicialCentavos: number;
  comprasCredito: readonly Gasto[];
  parcelas: readonly ParcelaDaFatura[];
  reembolsos: readonly Dinheiro[];
}): ComposicaoDaFatura {
  const compras = e.comprasCredito.filter(
    (g) =>
      g.pagamento?.cartaoId === e.cartaoId && g.pagamento.forma === 'credito',
  );
  const comprasCentavos = soma(compras.map((g) => g.valor.centavos));
  const parcelasCentavos = soma(e.parcelas.map((p) => p.valor.centavos));
  const reembolsosCentavos = soma(e.reembolsos.map((r) => r.centavos));
  const saldoCentavos =
    e.inicialCentavos + comprasCentavos + parcelasCentavos - reembolsosCentavos;
  return {
    cartaoId: e.cartaoId,
    mes: e.mes,
    vencimento: e.vencimento,
    inicialCentavos: e.inicialCentavos,
    compras: { quantidade: compras.length, centavos: comprasCentavos },
    parcelas: [...e.parcelas],
    parcelasCentavos,
    reembolsosCentavos,
    totalCentavos: Math.max(0, saldoCentavos),
    creditoExcedenteCentavos: Math.max(0, -saldoCentavos),
  };
}
