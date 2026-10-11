import { somarDias } from './data-civil.js';
import { DiaInvalidoError, NomeDeCartaoInvalidoError } from './errors.js';
import { diaNoMes, mesDe, somarMeses } from './mes.js';

export const MAX_NOME_CARTAO = 30;
const DIA_MINIMO = 1;
const DIA_MAXIMO = 31;
const SEM_CONTROLE = /^[^\p{Cc}\p{Cf}]*$/u;

export function normalizarNomeCartao(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function validarDia(dia: number, qual: string): void {
  if (!Number.isInteger(dia) || dia < DIA_MINIMO || dia > DIA_MAXIMO)
    throw new DiaInvalidoError(`Dia de ${qual} inválido: ${dia}`);
}

export interface PropsRestaurarCartao {
  id: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  criadoEm: Date;
}

export class Cartao {
  private constructor(
    readonly id: string,
    readonly nome: string,
    readonly nomeNormalizado: string,
    readonly diaFechamento: number,
    readonly diaVencimento: number,
    readonly criadoEm: Date,
  ) {}

  static criar(p: {
    nome: string;
    diaFechamento: number;
    diaVencimento: number;
    agora: Date;
  }): Cartao {
    // Controle é checado no texto original: o colapso de espaços esconderia `\n`.
    const nome = p.nome.trim().replace(/\s+/g, ' ');
    if (
      nome === '' ||
      Array.from(nome).length > MAX_NOME_CARTAO ||
      !SEM_CONTROLE.test(p.nome) ||
      /[<>]/.test(p.nome.normalize('NFKC'))
    )
      throw new NomeDeCartaoInvalidoError('Nome de cartão inválido');
    validarDia(p.diaFechamento, 'fechamento');
    validarDia(p.diaVencimento, 'vencimento');
    return new Cartao(
      crypto.randomUUID(),
      nome,
      normalizarNomeCartao(nome),
      p.diaFechamento,
      p.diaVencimento,
      p.agora,
    );
  }

  static restaurar(p: PropsRestaurarCartao): Cartao {
    return new Cartao(
      p.id,
      p.nome,
      normalizarNomeCartao(p.nome),
      p.diaFechamento,
      p.diaVencimento,
      p.criadoEm,
    );
  }

  /** Mês (AAAA-MM) do vencimento da fatura em que uma compra em `data` cai. */
  mesDaFatura(data: string): string {
    const mesCompra = mesDe(data);
    const mesFechamento =
      data <= this.fechamentoEm(mesCompra)
        ? mesCompra
        : somarMeses(mesCompra, 1);
    return this.mesDoVencimentoApos(mesFechamento);
  }

  vencimentoDe(mes: string): string {
    return diaNoMes(mes, this.diaVencimento);
  }

  /** Mês do primeiro vencimento estritamente depois de `hoje`. */
  proximaFaturaEmAberto(hoje: string): string {
    const mes = mesDe(hoje);
    return hoje < this.vencimentoDe(mes) ? mes : somarMeses(mes, 1);
  }

  /** Compras da fatura que vence em `mesFatura`: de `inicio` (inclusive) até `fimExclusivo`. */
  cicloDaFatura(mesFatura: string): { inicio: string; fimExclusivo: string } {
    const mesFechamento = this.venceNoMesDoFechamento
      ? mesFatura
      : somarMeses(mesFatura, -1);
    return {
      inicio: somarDias(this.fechamentoEm(somarMeses(mesFechamento, -1)), 1),
      fimExclusivo: somarDias(this.fechamentoEm(mesFechamento), 1),
    };
  }

  private fechamentoEm(mes: string): string {
    return diaNoMes(mes, this.diaFechamento);
  }

  /** Decidido pelos dias crus: o ajuste ao fim do mês não pode juntar dois ciclos. */
  private get venceNoMesDoFechamento(): boolean {
    return this.diaVencimento > this.diaFechamento;
  }

  private mesDoVencimentoApos(mesFechamento: string): string {
    return this.venceNoMesDoFechamento
      ? mesFechamento
      : somarMeses(mesFechamento, 1);
  }
}
