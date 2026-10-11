import { Cartao, normalizarNomeCartao } from '../../domain/cartao.js';
import { normalizarCategoria } from '../../domain/categoria.js';
import { normalizarCategoriaEntrada } from '../../domain/categoria-entrada.js';
import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Entrada, type VinculoFatura } from '../../domain/entrada.js';
import {
  FORMAS_PAGAMENTO,
  Gasto,
  type FormaPagamento,
  type OrigemGasto,
  type Pagamento,
} from '../../domain/gasto.js';
import { mesDe } from '../../domain/mes.js';
import { Parcelamento } from '../../domain/parcelamento.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { RegistroRepository } from '../../domain/ports/registro.repository.js';
import {
  CartaoNaoCadastradoError,
  EscolhaInvalidaError,
  NenhumCartaoCadastradoError,
  NenhumGastoEncontradoError,
} from '../errors.js';
import type {
  EntradaExtraida,
  GastoExtraido,
  Interpretacao,
  ParcelamentoExtraido,
} from '../ports/interpretador-de-mensagem.js';
import type { Pendencias } from '../ports/pendencias.js';
import type { Relogio } from '../ports/relogio.js';

type InterpretacaoDeRegistro = Extract<
  Interpretacao,
  { intencao: 'registrar' }
>;

export type Escolha =
  | { tipo: 'forma'; indiceGasto: number }
  | {
      tipo: 'cartao';
      alvo: 'gasto' | 'entrada' | 'parcelamento';
      indice: number;
    };

export interface RegistroPendente {
  interpretacao: InterpretacaoDeRegistro;
  origem: OrigemGasto;
  /** Respostas já dadas, por `chaveDaEscolha`. */
  escolhas: Record<string, string>;
  proxima: Escolha;
  /** Opções oferecidas na pergunta: o botão responde pelo índice (callback de 64 bytes). */
  opcoes: OpcaoDeEscolha[];
}

export interface OpcaoDeEscolha {
  rotulo: string;
  valor: string;
}

export type AvisoRegistro = 'reembolso-sem-cartao';

export type ResultadoRegistro =
  | {
      tipo: 'registrado';
      registroId: string;
      gastos: Gasto[];
      entradas: Entrada[];
      parcelamentos: Parcelamento[];
      cartoes: Map<string, Cartao>;
      textoOriginal: string;
      avisos: AvisoRegistro[];
    }
  | {
      tipo: 'escolha';
      pendenteId: string;
      escolha: Escolha;
      opcoes: OpcaoDeEscolha[];
      textoOriginal: string;
    };

/** Chave da resposta em `escolhas`: `forma:<i>` ou `cartao:<alvo>:<i>`. */
export function chaveDaEscolha(escolha: Escolha): string {
  return escolha.tipo === 'forma'
    ? `forma:${escolha.indiceGasto}`
    : `cartao:${escolha.alvo}:${escolha.indice}`;
}

/** Interrompe a resolução quando falta uma resposta do usuário (uso interno). */
class PrecisaEscolher {
  constructor(readonly escolha: Escolha) {}
}

const OPCOES_DE_FORMA: OpcaoDeEscolha[] = [
  { rotulo: '💳 Crédito', valor: 'credito' },
  { rotulo: '🏦 Débito', valor: 'debito' },
];

export class RegistrarLancamentosUseCase {
  constructor(
    private readonly registros: RegistroRepository,
    private readonly cartoes: CartaoRepository,
    private readonly pendencias: Pendencias<RegistroPendente>,
    private readonly relogio: Relogio,
  ) {}

  async executar(e: {
    interpretacao: InterpretacaoDeRegistro;
    origem: OrigemGasto;
    escolhas?: Record<string, string>;
  }): Promise<ResultadoRegistro> {
    const { interpretacao, origem } = e;
    const { gastos, entradas, parcelamentos, textoOriginal } = interpretacao;
    if (gastos.length + entradas.length + parcelamentos.length === 0) {
      throw new NenhumGastoEncontradoError(
        'Nenhum lançamento encontrado na mensagem',
        textoOriginal,
      );
    }
    const cadastrados = await this.cartoes.listar();
    const escolhas = e.escolhas ?? {};
    try {
      return await this.registrar(
        new Resolucao(
          cadastrados,
          escolhas,
          origem,
          textoOriginal,
          this.relogio.agora(),
        ),
        interpretacao,
      );
    } catch (erro) {
      if (!(erro instanceof PrecisaEscolher)) throw erro;
      return this.pedir(erro.escolha, cadastrados, {
        interpretacao,
        origem,
        escolhas,
      });
    }
  }

  private async registrar(
    r: Resolucao,
    i: InterpretacaoDeRegistro,
  ): Promise<ResultadoRegistro> {
    // Tudo é criado (e validado) antes de salvar: registro tudo ou nada.
    const gastos = i.gastos.map((g, n) => r.gasto(g, n));
    const entradas = i.entradas.map((x, n) => r.entrada(x, n));
    const parcelamentos = i.parcelamentos.map((p, n) => r.parcelamento(p, n));
    // Só depois de validar tudo o que independe de escolha, para o usuário
    // não responder um botão e então receber um erro.
    if (r.primeiraEscolhaPendente)
      throw new PrecisaEscolher(r.primeiraEscolhaPendente);
    await this.registros.salvar({ gastos, entradas, parcelamentos });
    return {
      tipo: 'registrado',
      registroId: r.registroId,
      gastos,
      entradas,
      parcelamentos,
      cartoes: r.usados,
      textoOriginal: r.textoOriginal,
      avisos: r.avisos,
    };
  }

  private pedir(
    escolha: Escolha,
    cadastrados: readonly Cartao[],
    base: Omit<RegistroPendente, 'proxima' | 'opcoes'>,
  ): ResultadoRegistro {
    const opcoes =
      escolha.tipo === 'forma'
        ? OPCOES_DE_FORMA
        : cadastrados.map((c) => ({ rotulo: c.nome, valor: c.id }));
    const pendenteId = this.pendencias.guardar({
      ...base,
      proxima: escolha,
      opcoes,
    });
    return {
      tipo: 'escolha',
      pendenteId,
      escolha,
      opcoes,
      textoOriginal: base.interpretacao.textoOriginal,
    };
  }
}

/** Converte os itens extraídos em entidades, pedindo escolha onde a mensagem não bastou. */
class Resolucao {
  readonly registroId = crypto.randomUUID();
  readonly usados = new Map<string, Cartao>();
  readonly avisos: AvisoRegistro[] = [];
  /** Primeira escolha que faltou; a resolução segue com um valor provisório para validar o resto. */
  primeiraEscolhaPendente: Escolha | null = null;
  private readonly hoje: string;

  constructor(
    private readonly cadastrados: readonly Cartao[],
    private readonly escolhas: Record<string, string>,
    private readonly origem: OrigemGasto,
    readonly textoOriginal: string,
    private readonly agora: Date,
  ) {
    this.hoje = hojeEmSaoPaulo(agora);
  }

  private ordem = 0;

  /** `criadoEm` crescente na ordem de extração: o banco ordena o registro por ele. */
  private instante(): Date {
    return new Date(this.agora.getTime() + this.ordem++);
  }

  gasto(g: GastoExtraido, indice: number): Gasto {
    return Gasto.criar({
      valor: Dinheiro.deReais(g.valorReais),
      categoria: normalizarCategoria(g.categoria),
      descricao: g.descricao,
      dataGasto: g.dataGasto,
      origem: this.origem,
      textoOriginal: this.textoOriginal,
      agora: this.instante(),
      registroId: this.registroId,
      pagamento: this.pagamento(g, indice),
    });
  }

  entrada(x: EntradaExtraida, indice: number): Entrada {
    const categoria = normalizarCategoriaEntrada(x.categoria);
    return Entrada.criar({
      valor: Dinheiro.deReais(x.valorReais),
      categoria,
      descricao: x.descricao,
      dataEntrada: x.dataEntrada,
      origem: this.origem,
      textoOriginal: this.textoOriginal,
      agora: this.instante(),
      registroId: this.registroId,
      vinculo: categoria === 'reembolso' ? this.vinculo(x, indice) : null,
    });
  }

  parcelamento(p: ParcelamentoExtraido, indice: number): Parcelamento {
    const cartao = this.cartao(p.cartao, 'parcelamento', indice);
    const emAndamento = p.parcelaAtual !== null;
    return Parcelamento.criar({
      cartaoId: cartao.id,
      descricao: p.descricao,
      categoria: normalizarCategoria(p.categoria),
      totalCentavos: centavosOuNulo(p.totalReais),
      valorParcelaCentavos: centavosOuNulo(p.valorParcelaReais),
      quantidade: p.quantidade,
      parcelaInicial: p.parcelaAtual ?? 1,
      dataCompra: p.dataCompra,
      mesCompetenciaInicial: mesDe(emAndamento ? this.hoje : p.dataCompra),
      mesFaturaInicial: emAndamento
        ? cartao.proximaFaturaEmAberto(this.hoje)
        : cartao.mesDaFatura(p.dataCompra),
      origem: this.origem,
      textoOriginal: this.textoOriginal,
      registroId: this.registroId,
      agora: this.instante(),
    });
  }

  private pagamento(g: GastoExtraido, indice: number): Pagamento | null {
    if (g.cartao === null && g.formaPagamento === null) return null;
    const cartao = this.cartao(g.cartao, 'gasto', indice);
    return {
      cartaoId: cartao.id,
      forma: g.formaPagamento ?? this.forma(indice),
    };
  }

  private faltou(escolha: Escolha): void {
    this.primeiraEscolhaPendente ??= escolha;
  }

  private forma(indiceGasto: number): FormaPagamento {
    const escolha: Escolha = { tipo: 'forma', indiceGasto };
    const valor = this.escolhas[chaveDaEscolha(escolha)];
    if (valor === undefined) {
      this.faltou(escolha);
      return 'credito';
    }
    const forma = FORMAS_PAGAMENTO.find((f) => f === valor);
    if (!forma) throw new EscolhaInvalidaError('Forma de pagamento inválida');
    return forma;
  }

  private vinculo(x: EntradaExtraida, indice: number): VinculoFatura | null {
    if (x.cartao === null && x.mesFatura === null) return null;
    if (this.cadastrados.length === 0) {
      if (!this.avisos.includes('reembolso-sem-cartao'))
        this.avisos.push('reembolso-sem-cartao');
      return null;
    }
    const cartao = this.cartao(x.cartao, 'entrada', indice);
    return {
      cartaoId: cartao.id,
      mesFatura: x.mesFatura ?? cartao.proximaFaturaEmAberto(this.hoje),
    };
  }

  /** Cartão citado; senão o único cadastrado; senão a escolha do usuário. */
  private cartao(
    nome: string | null,
    alvo: 'gasto' | 'entrada' | 'parcelamento',
    indice: number,
  ): Cartao {
    const cartao =
      nome === null ? this.semNome(alvo, indice) : this.citado(nome);
    this.usados.set(cartao.id, cartao);
    return cartao;
  }

  private citado(nome: string): Cartao {
    const normalizado = normalizarNomeCartao(nome);
    const cartao = this.cadastrados.find(
      (c) => c.nomeNormalizado === normalizado,
    );
    if (!cartao) throw new CartaoNaoCadastradoError(nome);
    return cartao;
  }

  private semNome(
    alvo: 'gasto' | 'entrada' | 'parcelamento',
    indice: number,
  ): Cartao {
    const [primeiro] = this.cadastrados;
    if (!primeiro)
      throw new NenhumCartaoCadastradoError('Nenhum cartão cadastrado');
    if (this.cadastrados.length === 1) return primeiro;
    const escolha: Escolha = { tipo: 'cartao', alvo, indice };
    const id = this.escolhas[chaveDaEscolha(escolha)];
    if (id === undefined) {
      this.faltou(escolha);
      return primeiro;
    }
    const cartao = this.cadastrados.find((c) => c.id === id);
    if (!cartao) throw new EscolhaInvalidaError('Cartão inválido');
    return cartao;
  }
}

const centavosOuNulo = (reais: number | null): number | null =>
  reais === null ? null : Dinheiro.deReais(reais).centavos;
