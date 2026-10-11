import type { Cartao } from '../../domain/cartao.js';
import { normalizarCategoria } from '../../domain/categoria.js';
import { normalizarCategoriaEntrada } from '../../domain/categoria-entrada.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Entrada } from '../../domain/entrada.js';
import {
  Gasto,
  type FormaPagamento,
  type Pagamento,
} from '../../domain/gasto.js';
import type { CartaoRepository } from '../../domain/ports/cartao.repository.js';
import type { RegistroRepository } from '../../domain/ports/registro.repository.js';
import {
  CorrecaoVaziaError,
  EscolhaNecessariaNaEdicaoError,
  IndiceDeCorrecaoInvalidoError,
  NenhumCartaoCadastradoError,
  PendenciaExpiradaError,
  RegistroNaoEncontradoError,
  RegistroVazioError,
} from '../errors.js';
import type {
  Correcao,
  EntradaMensagem,
  GastoExtraido,
  InterpretadorDeMensagem,
  ItemParaCorrecao,
} from '../ports/interpretador-de-mensagem.js';
import type { Pendencias } from '../ports/pendencias.js';
import type { Relogio } from '../ports/relogio.js';
import { buscarCartaoPorNome } from './cartoes.use-cases.js';

type Item = Gasto | Entrada;
type Alteracao = Correcao['alteracoes'][number];

/**
 * Antes/depois de uma edição já validada. `depois` são os itens que sobram
 * (editados ou intactos, mesma instância se nada mudou neles).
 */
export interface PropostaDeEdicao {
  readonly registroId: string;
  readonly antes: readonly Item[];
  readonly depois: readonly Item[];
  readonly removidos: readonly Item[];
  readonly acrescentados: readonly Gasto[];
  readonly cartoes: ReadonlyMap<string, Cartao>;
}

export class PrepararEdicaoUseCase {
  constructor(
    private readonly registros: RegistroRepository,
    private readonly cartoes: CartaoRepository,
    private readonly interpretador: InterpretadorDeMensagem,
    private readonly pendencias: Pendencias<PropostaDeEdicao>,
    private readonly relogio: Relogio,
  ) {}

  async executar(
    registroId: string,
    entrada: EntradaMensagem,
  ): Promise<{
    pendenteId: string;
    proposta: PropostaDeEdicao;
    transcricao?: string;
  }> {
    const { gastos, entradas, parcelamentos } =
      await this.registros.carregar(registroId);
    const antes: Item[] = [...gastos, ...entradas];
    if (antes.length === 0)
      throw new RegistroNaoEncontradoError(parcelamentos.length > 0);

    const cadastrados = await this.cartoes.listar();
    const porId = new Map(cadastrados.map((c) => [c.id, c]));
    const agora = this.relogio.agora();
    const correcao = await this.interpretador.interpretarCorrecao(
      entrada,
      antes.map((item, i) => paraCorrecao(item, i + 1, porId)),
      agora,
      { cartoes: cadastrados.map((c) => c.nome) },
    );
    validarIndices(correcao, antes.length);

    const edicao = new Edicao(this.cartoes, cadastrados, agora);
    const removidos = correcao.remover.map((n) => antes[n - 1]!);
    const depois = await aplicarAlteracoes(edicao, antes, removidos, correcao);
    const acrescentados: Gasto[] = [];
    for (const g of correcao.acrescentar)
      acrescentados.push(
        await edicao.acrescentar(
          g,
          registroId,
          entrada,
          correcao.textoOriginal,
        ),
      );

    // Parcelamento remanescente mantém o registro vivo.
    if (
      depois.length + acrescentados.length === 0 &&
      parcelamentos.length === 0
    )
      throw new RegistroVazioError('Remover tudo apaga o registro');
    if (
      removidos.length === 0 &&
      acrescentados.length === 0 &&
      depois.every((d, i) => d === antes[i])
    )
      throw new CorrecaoVaziaError('Nada mudou');

    const proposta: PropostaDeEdicao = {
      registroId,
      antes,
      depois,
      removidos,
      acrescentados,
      cartoes: cartoesUsados(porId, [...antes, ...depois, ...acrescentados]),
    };
    return {
      pendenteId: this.pendencias.guardar(proposta),
      proposta,
      transcricao:
        entrada.tipo === 'audio' ? correcao.textoOriginal : undefined,
    };
  }
}

export class ConfirmarEdicaoUseCase {
  constructor(
    private readonly registros: RegistroRepository,
    private readonly pendencias: Pendencias<PropostaDeEdicao>,
  ) {}

  async executar(pendenteId: string): Promise<PropostaDeEdicao> {
    // obter + descartar síncronos: dois cliques seguidos não aplicam duas vezes.
    const proposta = this.pendencias.obter(pendenteId);
    if (!proposta) throw new PendenciaExpiradaError('Edição expirada');
    this.pendencias.descartar(pendenteId);
    await this.registros.aplicarEdicao({
      atualizar: proposta.depois.filter((d) => !proposta.antes.includes(d)),
      remover: [...proposta.removidos],
      inserir: [...proposta.acrescentados],
    });
    return proposta;
  }
}

export class CancelarEdicaoUseCase {
  constructor(private readonly pendencias: Pendencias<PropostaDeEdicao>) {}

  /** Já confirmada, cancelada ou vencida → `PendenciaExpiradaError` (o botão não pode mentir "cancelada"). */
  executar(pendenteId: string): void {
    if (!this.pendencias.obter(pendenteId))
      throw new PendenciaExpiradaError('Edição expirada');
    this.pendencias.descartar(pendenteId);
  }
}

function paraCorrecao(
  item: Item,
  indice: number,
  cartoes: ReadonlyMap<string, Cartao>,
): ItemParaCorrecao {
  const comum = {
    indice,
    valorReais: item.valor.centavos / 100,
    categoria: item.categoria,
    descricao: item.descricao,
  };
  if (item instanceof Entrada)
    return { tipo: 'entrada', ...comum, data: item.dataEntrada };
  return {
    tipo: 'gasto',
    ...comum,
    data: item.dataGasto,
    cartao: item.pagamento
      ? (cartoes.get(item.pagamento.cartaoId)?.nome ?? null)
      : null,
    formaPagamento: item.pagamento?.forma ?? null,
  };
}

/** Cada número de 1 a `total` aparece no máximo uma vez entre alterações e remoções. */
function validarIndices(correcao: Correcao, total: number): void {
  const indices = [
    ...correcao.alteracoes.map((a) => a.indice),
    ...correcao.remover,
  ];
  if (indices.some((n) => !Number.isInteger(n) || n < 1 || n > total))
    throw new IndiceDeCorrecaoInvalidoError(`Número fora de 1 a ${total}`);
  if (new Set(indices).size !== indices.length)
    throw new IndiceDeCorrecaoInvalidoError('Número repetido na correção');
}

async function aplicarAlteracoes(
  edicao: Edicao,
  antes: readonly Item[],
  removidos: readonly Item[],
  correcao: Correcao,
): Promise<Item[]> {
  const depois: Item[] = [];
  for (const [i, item] of antes.entries()) {
    if (removidos.includes(item)) continue;
    const alteracao = correcao.alteracoes.find((a) => a.indice === i + 1);
    depois.push(alteracao ? await edicao.aplicar(item, alteracao) : item);
  }
  return depois;
}

function cartoesUsados(
  porId: ReadonlyMap<string, Cartao>,
  itens: readonly Item[],
): ReadonlyMap<string, Cartao> {
  const usados = new Map<string, Cartao>();
  for (const i of itens) {
    const cartao =
      i instanceof Gasto && i.pagamento && porId.get(i.pagamento.cartaoId);
    if (cartao) usados.set(cartao.id, cartao);
  }
  return usados;
}

/** Aplica alterações no domínio; qualquer invariante violada sobe como erro de domínio. */
class Edicao {
  private acrescentados = 0;

  constructor(
    private readonly cartoes: CartaoRepository,
    private readonly cadastrados: readonly Cartao[],
    private readonly agora: Date,
  ) {}

  async aplicar(item: Item, a: Alteracao): Promise<Item> {
    const valor =
      a.valorReais === undefined ? undefined : Dinheiro.deReais(a.valorReais);
    const editado =
      item instanceof Entrada
        ? this.entrada(item, a, valor)
        : item.editar(
            {
              valor,
              descricao: a.descricao,
              categoria:
                a.categoria === undefined
                  ? undefined
                  : normalizarCategoria(a.categoria),
              dataGasto: a.data,
              pagamento: await this.pagamentoAlterado(item, a),
            },
            this.agora,
          );
    return mudou(item, editado) ? editado : item;
  }

  async acrescentar(
    g: GastoExtraido,
    registroId: string,
    entrada: EntradaMensagem,
    textoOriginal: string,
  ): Promise<Gasto> {
    return Gasto.criar({
      valor: Dinheiro.deReais(g.valorReais),
      categoria: normalizarCategoria(g.categoria),
      descricao: g.descricao,
      dataGasto: g.dataGasto,
      origem: entrada.tipo,
      textoOriginal,
      // `criadoEm` crescente: o banco ordena o registro por ele.
      agora: new Date(this.agora.getTime() + this.acrescentados++),
      registroId,
      pagamento: await this.pagamento(g.cartao, g.formaPagamento, null),
    });
  }

  private entrada(
    item: Entrada,
    a: Alteracao,
    valor: Dinheiro | undefined,
  ): Entrada {
    const categoria =
      a.categoria === undefined
        ? undefined
        : normalizarCategoriaEntrada(a.categoria);
    return item.editar(
      {
        valor,
        descricao: a.descricao,
        categoria,
        dataEntrada: a.data,
        // Só reembolso tem vínculo com fatura.
        vinculo:
          categoria !== undefined && categoria !== 'reembolso'
            ? null
            : undefined,
      },
      this.agora,
    );
  }

  /** `undefined` = não mexe; `null` = tira cartão e forma. */
  private async pagamentoAlterado(
    g: Gasto,
    a: Alteracao,
  ): Promise<Pagamento | null | undefined> {
    if (a.cartao === undefined && a.formaPagamento === undefined)
      return undefined;
    if (
      a.cartao === null ||
      (a.cartao === undefined && a.formaPagamento === null)
    )
      return null;
    return this.pagamento(
      a.cartao ?? null,
      a.formaPagamento ?? null,
      g.pagamento,
    );
  }

  /** Cartão citado, senão o atual, senão o único cadastrado; forma citada, senão a atual. */
  private async pagamento(
    nome: string | null,
    forma: FormaPagamento | null,
    atual: Pagamento | null,
  ): Promise<Pagamento | null> {
    if (nome === null && forma === null) return null;
    const cartaoId =
      nome !== null
        ? (await buscarCartaoPorNome(this.cartoes, nome)).id
        : (atual?.cartaoId ?? this.unico().id);
    const formaFinal = forma ?? atual?.forma;
    if (!formaFinal) throw new EscolhaNecessariaNaEdicaoError();
    return { cartaoId, forma: formaFinal };
  }

  private unico(): Cartao {
    const [primeiro] = this.cadastrados;
    if (!primeiro)
      throw new NenhumCartaoCadastradoError('Nenhum cartão cadastrado');
    if (this.cadastrados.length > 1) throw new EscolhaNecessariaNaEdicaoError();
    return primeiro;
  }
}

function mudou(antes: Item, depois: Item): boolean {
  const comum =
    antes.valor.centavos !== depois.valor.centavos ||
    antes.categoria !== depois.categoria ||
    antes.descricao !== depois.descricao;
  if (antes instanceof Entrada && depois instanceof Entrada)
    return (
      comum ||
      antes.dataEntrada !== depois.dataEntrada ||
      antes.vinculo?.cartaoId !== depois.vinculo?.cartaoId ||
      antes.vinculo?.mesFatura !== depois.vinculo?.mesFatura
    );
  if (antes instanceof Gasto && depois instanceof Gasto)
    return (
      comum ||
      antes.dataGasto !== depois.dataGasto ||
      antes.pagamento?.cartaoId !== depois.pagamento?.cartaoId ||
      antes.pagamento?.forma !== depois.pagamento?.forma
    );
  return true;
}
