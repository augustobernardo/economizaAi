import {
  diasEntre,
  ehDataCivilValida,
  formatarDataBr,
  somarDias,
  ultimoDiaDoMes,
} from './data-civil.js';
import {
  DataInvalidaError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
} from './errors.js';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
export const MAX_DIAS_PERIODO = 366;
export type TipoPeriodo = 'dia' | 'mes' | 'intervalo';

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split('-').map(Number);
  return [a!, m!, d!];
}

function classificar(inicio: string, fimPedido: string): TipoPeriodo {
  if (inicio === fimPedido) return 'dia';
  const [ai, mi, di] = partes(inicio);
  const [af, mf, df] = partes(fimPedido);
  return di === 1 && ai === af && mi === mf && df === ultimoDiaDoMes(af, mf)
    ? 'mes'
    : 'intervalo';
}

/** Intervalo de datas civis (inclusivo) já validado: nunca no futuro, nunca maior que 1 ano. */
export class Periodo {
  private constructor(
    readonly inicio: string,
    readonly fim: string,
    readonly tipo: TipoPeriodo,
  ) {}

  static criar(inicio: string, fim: string, hoje: string): Periodo {
    for (const data of [inicio, fim]) {
      if (!ehDataCivilValida(data))
        throw new DataInvalidaError(`Data inválida: "${data}"`);
    }
    if (inicio > fim)
      throw new PeriodoInvertidoError(
        `Início "${inicio}" depois do fim "${fim}"`,
      );
    if (inicio > hoje)
      throw new PeriodoFuturoError(
        `Início "${inicio}" depois de hoje "${hoje}"`,
      );
    const fimEfetivo = fim > hoje ? hoje : fim;
    if (diasEntre(inicio, fimEfetivo) + 1 > MAX_DIAS_PERIODO) {
      throw new PeriodoLongoDemaisError(
        `Período de ${inicio} a ${fimEfetivo} passa de ${MAX_DIAS_PERIODO} dias`,
      );
    }
    return new Periodo(inicio, fimEfetivo, classificar(inicio, fim));
  }

  /** Mês de `hoje` deslocado (0 = atual, -1 = anterior). */
  static doMes(hoje: string, deslocamento: number): Periodo {
    const [ano, mes] = partes(hoje);
    const indice = ano * 12 + (mes - 1) + deslocamento;
    const a = Math.floor(indice / 12);
    const m = (indice % 12) + 1;
    const mm = String(m).padStart(2, '0');
    const ultimo = String(ultimoDiaDoMes(a, m)).padStart(2, '0');
    return Periodo.criar(`${a}-${mm}-01`, `${a}-${mm}-${ultimo}`, hoje);
  }

  get fimExclusivo(): string {
    return somarDias(this.fim, 1);
  }

  get slug(): string {
    if (this.tipo === 'dia') return this.inicio;
    if (this.tipo === 'mes') return this.inicio.slice(0, 7);
    return `${this.inicio}_a_${this.fim}`;
  }

  descrever(): string {
    if (this.tipo === 'dia') return formatarDataBr(this.inicio);
    if (this.tipo === 'mes') {
      const [ano, mes] = partes(this.inicio);
      return `${MESES[mes - 1]} de ${ano}`;
    }
    return `${formatarDataBr(this.inicio)} a ${formatarDataBr(this.fim)}`;
  }
}
