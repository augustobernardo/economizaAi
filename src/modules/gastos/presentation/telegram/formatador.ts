import {
  CartaoEmUsoError,
  CartaoJaExisteError,
  CartaoNaoCadastradoError,
  CartaoNaoEncontradoError,
  CorrecaoVaziaError,
  EscolhaDeCartaoNecessariaError,
  EscolhaInvalidaError,
  EscolhaNecessariaNaEdicaoError,
  IndiceDeCorrecaoInvalidoError,
  NenhumCartaoCadastradoError,
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ParcelamentoSemCreditoError,
  PendenciaExpiradaError,
  ProvedorIndisponivelError,
  RegistroAlteradoError,
  RegistroNaoEncontradoError,
  RegistroVazioError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type { PropostaDeEdicao } from '../../application/use-cases/edicao.use-cases.js';
import type { ListarParcelamentosUseCase } from '../../application/use-cases/parcelamentos.use-cases.js';
import type {
  Escolha,
  AvisoRegistro,
} from '../../application/use-cases/registrar-lancamentos.use-case.js';
import type { ResultadoProcessamento } from '../../application/use-cases/processar-mensagem.use-case.js';
import { MAX_DIAS_ATE_VENCIMENTO, type Cartao } from '../../domain/cartao.js';
import { ROTULOS_CATEGORIA, type Categoria } from '../../domain/categoria.js';
import { ROTULOS_CATEGORIA_ENTRADA } from '../../domain/categoria-entrada.js';
import { somarDias } from '../../domain/data-civil.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Entrada } from '../../domain/entrada.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  DiaInvalidoError,
  IntervaloDeFaturaInvalidoError,
  MesInvalidoError,
  NomeDeCartaoInvalidoError,
  ParcelaInicialInvalidaError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
  QuantidadeDeParcelasInvalidaError,
  ValorAcimaDoTetoError,
  ValorDoParcelamentoAusenteError,
  ValorInicialInvalidoError,
  ValorInvalidoError,
  VinculoDeFaturaInvalidoError,
} from '../../domain/errors.js';
import type {
  ComposicaoDaFatura,
  FaturaInformada,
} from '../../domain/fatura.js';
import type { Gasto, Pagamento } from '../../domain/gasto.js';
import { formatarMesCurto } from '../../domain/mes.js';
import {
  MAX_PARCELAS,
  MIN_PARCELAS,
  type Parcelamento,
} from '../../domain/parcelamento.js';
import type { Periodo } from '../../domain/periodo.js';
import type { ResumoDoPeriodo } from '../../domain/resumo-do-periodo.js';
import { plural } from '../../domain/resumo.js';
import {
  BYTES_POR_MB,
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import { DownloadFalhouError } from './download.js';
import { escaparHtml, html, juntarHtml, type Html } from './html.js';

export const EMOJI_CATEGORIA: Record<Categoria, string> = {
  alimentacao: '🍔',
  mercado: '🛒',
  transporte: '🚗',
  moradia: '🏠',
  saude: '💊',
  lazer: '🎉',
  educacao: '📚',
  assinaturas: '🔁',
  vestuario: '👕',
  outros: '📦',
};

const rotulo = (c: Categoria): string => {
  const r = ROTULOS_CATEGORIA[c];
  return r.charAt(0).toUpperCase() + r.slice(1);
};
const comEmoji = (c: Categoria): string => `${EMOJI_CATEGORIA[c]} ${rotulo(c)}`;

/** `YYYY-MM-DD` → `dd/MM`, sem `Date` (evita erro de fuso). */
function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export function dataRelativa(data: string, hoje: string): string {
  if (data === hoje) return `Hoje, ${diaMes(data)}`;
  if (data === somarDias(hoje, -1)) return `Ontem, ${diaMes(data)}`;
  return diaMes(data);
}

/** "outubro/2026" para mês; dia e intervalo usam `descrever()`. */
function nomeDoPeriodo(periodo: Periodo): string {
  return periodo.tipo === 'mes'
    ? periodo.descrever().replace(' de ', '/')
    : periodo.descrever();
}

const EXEMPLOS: readonly Html[] = [
  html`• <i>gastei 30 no almoço</i>`,
  html`• <i>uber 18,50 ontem</i>`,
  html`• <i>mercado 120 e farmácia 40</i>`,
];

export const MENSAGEM_NENHUM_GASTO = juntarHtml([
  html`🔍 Não encontrei nenhum gasto nessa mensagem.`,
  html``,
  html`Tente algo como:`,
  ...EXEMPLOS.slice(0, 2),
]);

export const TEXTO_START = juntarHtml([
  html`👋 Olá! Eu sou o <b>Eco</b>, seu assistente de gastos.`,
  html``,
  html`Me conte o que você gastou ou recebeu, por texto ou áudio, que eu registro tudo pra você. 💸`,
  html``,
  html`<b>✨ O que eu faço</b>`,
  html`✍️ Registro gastos e entradas por texto`,
  html`🎙️ Entendo mensagens de áudio`,
  html`🧠 Identifico valor, categoria e data sozinho`,
  html`💳 Controlo cartões, faturas e parcelamentos`,
  html`🧾 Registro vários lançamentos numa mensagem só`,
  html`✏️ Corrijo um registro: é só responder a ele`,
  html`↩️ Desfaço um registro com um toque`,
  html`📈 Resumo o mês com entradas, gastos e saldo`,
  html`📊 Exporto as movimentações em CSV e Markdown`,
  html``,
  html`<b>💬 Experimente mandar</b>`,
  ...EXEMPLOS,
  html`• <i>gastei 30 no crédito do Inter</i>`,
  html`• <i>recebi 4200 de salário</i>`,
  html``,
  html`<b>⚙️ Comandos</b>`,
  html`/ajuda: exemplos e dicas`,
  html`/resumo: resumo do mês`,
  html`/ultimos: últimos gastos`,
  html`/exportar: exportar o mês`,
  html`/cartoes: seus cartões`,
  html`/fatura: fatura do cartão`,
  html`/parcelamentos: compras parceladas`,
  html``,
  html`🔒 Só respondo a você, e seus registros ficam guardados no seu próprio servidor.`,
]);

export const TEXTO_AJUDA = juntarHtml([
  html`💡 <b>Como usar o Eco</b>`,
  html``,
  html`<b>Registrar</b>`,
  ...EXEMPLOS,
  html`• <i>anteontem cinquenta reais de farmácia</i>`,
  html`• <i>2 cafés de 8 na sexta</i>`,
  html``,
  html`<b>Cartões e parcelas</b>`,
  html`• <i>gastei 30 no crédito do Inter</i>`,
  html`• <i>parcelei 1000 no Inter em 10x</i>`,
  html`• <i>fatura do Inter de 400 para novembro</i>`,
  html``,
  html`<b>Entradas</b>`,
  html`• <i>recebi 4200 de salário</i>`,
  html``,
  html`<b>Corrigir</b>`,
  html`• Responda a um registro com a correção, por exemplo <i>era 35, não 30</i>`,
  html``,
  html`<b>Perguntar</b>`,
  html`• <i>quanto gastei em setembro?</i>`,
  html`• <i>exporta meus gastos de agosto</i>`,
  html`• <i>quais foram meus últimos gastos?</i>`,
  html``,
  html`<b>⚙️ Comandos</b>`,
  html`/resumo: mês atual, ou <code>/resumo 2026-09</code> para outro mês`,
  html`/ultimos: últimos gastos`,
  html`/exportar: exportar o mês`,
  html`/cartoes: lista os cartões; <code>/cartoes add Inter 3 10</code> cadastra`,
  html`/fatura: faturas; <code>/fatura Inter 400 11/2026</code> informa o valor inicial`,
  html`/parcelamentos: compras parceladas em andamento`,
  html``,
  html`↩️ O botão Desfazer vale por 1 hora.`,
]);

/** Menu do Telegram (texto puro, não é HTML). */
export const COMANDOS = [
  { command: 'start', description: 'Apresentação do Eco' },
  { command: 'ajuda', description: 'Exemplos e dicas' },
  { command: 'resumo', description: 'Resumo do mês (ou /resumo 2026-09)' },
  { command: 'ultimos', description: 'Últimos gastos registrados' },
  { command: 'exportar', description: 'Exportar o mês em CSV e Markdown' },
  { command: 'cartoes', description: 'Ver e cadastrar cartões' },
  { command: 'fatura', description: 'Fatura do cartão' },
  { command: 'parcelamentos', description: 'Compras parceladas em andamento' },
];

export const MENSAGEM_TEXTO_LONGO = html`✂️ Mensagem muito longa (máximo de ${MAX_CARACTERES_TEXTO} caracteres). Pode resumir?`;
export const MENSAGEM_AUDIO_LONGO = html`🎧 Esse áudio é longo demais. Mande um de até ${MAX_DURACAO_AUDIO_S} segundos.`;
export const MENSAGEM_AUDIO_GRANDE = html`🎧 Esse áudio é grande demais (máximo de ${MAX_BYTES_AUDIO / BYTES_POR_MB} MB).`;
export const MENSAGEM_NAO_SUPORTADO = html`🙈 Por enquanto só entendo mensagens de texto e de voz.`;
export const MENSAGEM_COMANDO_DESCONHECIDO = html`❓ Não conheço esse comando. Veja /ajuda`;
/** Popup do botão barrado (texto puro, sem HTML); o chat recebe a versão `Html`. */
export const POPUP_RATE_LIMIT =
  '⏳ Calma! Muitas mensagens seguidas. Espere um minuto.';
export const MENSAGEM_RATE_LIMIT = html`${POPUP_RATE_LIMIT}`;
export const MENSAGEM_ESCOLHER_MES_EXPORTAR = html`📊 <b>Exportar movimentações</b>\nQual mês você quer exportar?`;

const mesCurto = formatarMesCurto;

/** `YYYY-MM-DD` → `dd/MM/YYYY`. */
const dataBr = (d: string): string => d.split('-').reverse().join('/');

const SINAL_MENOS = '−';

/** Centavos com sinal (`−R$ 10,00`); `Dinheiro` só aceita > 0, então o módulo vai nele. */
function reais(centavos: number): string {
  if (centavos === 0) return 'R$ 0,00';
  const absoluto = Dinheiro.deCentavos(Math.abs(centavos)).formatar();
  return centavos < 0 ? `${SINAL_MENOS}${absoluto}` : absoluto;
}

type Registro = Pick<
  Extract<ResultadoProcessamento, { tipo: 'registro' }>,
  'gastos' | 'entradas' | 'parcelamentos' | 'cartoes' | 'avisos'
>;

const AVISOS: Record<AvisoRegistro, Html> = {
  'reembolso-sem-cartao': html`ℹ️ Cadastre seus cartões com /cartoes para abater reembolsos na fatura.`,
};

const nomeDoCartao = (
  cartoes: ReadonlyMap<string, Cartao>,
  id: string,
): string => cartoes.get(id)?.nome ?? 'cartão';

/** Partes do pagamento (`fatura` só no crédito); `null` sem pagamento ou cartão desconhecido. */
function rotuloDoPagamento(
  g: Gasto,
  cartoes: ReadonlyMap<string, Cartao>,
): { cartao: string; forma: string; fatura: string | null } | null {
  const pagamento: Pagamento | null | undefined = g.pagamento;
  const cartao = pagamento && cartoes.get(pagamento.cartaoId);
  if (!pagamento || !cartao) return null;
  return pagamento.forma === 'debito'
    ? { cartao: cartao.nome, forma: 'débito', fatura: null }
    : {
        cartao: cartao.nome,
        forma: 'crédito',
        fatura: `fatura ${mesCurto(cartao.mesDaFatura(g.dataGasto))}`,
      };
}

/** `Inter · crédito · fatura nov/2026` (ou só `Inter · débito`); vazio sem pagamento. */
function formaDePagamento(
  g: Gasto,
  cartoes: ReadonlyMap<string, Cartao>,
): string {
  const r = rotuloDoPagamento(g, cartoes);
  if (!r) return '';
  return [r.cartao, r.forma, r.fatura].filter(Boolean).join(' · ');
}

/** `Inter crédito · fatura nov/2026` (forma colada ao cartão); vazio sem pagamento. */
function formaCompacta(g: Gasto, cartoes: ReadonlyMap<string, Cartao>): string {
  const r = rotuloDoPagamento(g, cartoes);
  if (!r) return '';
  const cartaoEForma = `${r.cartao} ${r.forma}`;
  return r.fatura ? `${cartaoEForma} · ${r.fatura}` : cartaoEForma;
}

function linhaDeFatura(p: Parcelamento): string {
  const ultima = mesCurto(p.ultimoMesFatura);
  const inicio = mesCurto(p.mesFaturaInicial);
  return p.parcelaInicial === 1
    ? `1ª parcela na fatura de ${inicio}, última em ${ultima}`
    : `parcela ${p.parcelaInicial} de ${p.quantidade} na fatura de ${inicio}, última em ${ultima}`;
}

const descricaoDoParcelamento = (p: Parcelamento): string =>
  `${p.total.formatar()} em ${p.quantidade}× de ${p.valorParcela.formatar()}`;

function blocoGasto(
  g: Gasto,
  c: ReadonlyMap<string, Cartao>,
  hoje: string,
): Html[] {
  const pagamento = formaCompacta(g, c);
  const resto = pagamento ? ` · ${pagamento}` : '';
  return [
    html`${comEmoji(g.categoria)}: ${g.valor.formatar()}`,
    html`     ${g.descricao} · ${dataRelativa(g.dataGasto, hoje)}${resto}`,
  ];
}

function blocoEntrada(
  e: Entrada,
  c: ReadonlyMap<string, Cartao>,
  hoje: string,
): Html[] {
  const abate = e.vinculo
    ? ` · abate fatura ${nomeDoCartao(c, e.vinculo.cartaoId)} ${mesCurto(e.vinculo.mesFatura)}`
    : '';
  return [
    html`💰 ${rotuloEntrada(e)}: ${e.valor.formatar()}`,
    html`     ${e.descricao} · ${dataRelativa(e.dataEntrada, hoje)}${abate}`,
  ];
}

const rotuloEntrada = (e: Entrada): string => {
  const r = ROTULOS_CATEGORIA_ENTRADA[e.categoria];
  return r.charAt(0).toUpperCase() + r.slice(1);
};

function blocoParcelamento(
  p: Parcelamento,
  c: ReadonlyMap<string, Cartao>,
): Html[] {
  return [
    html`🧾 <b>${p.descricao}</b>: ${descricaoDoParcelamento(p)}`,
    html`     ${nomeDoCartao(c, p.cartaoId)} crédito · ${linhaDeFatura(p)}`,
  ];
}

function registroUnico(r: Registro, hoje: string): Html[] {
  const { cartoes } = r;
  const [g] = r.gastos;
  if (g) {
    const forma = formaDePagamento(g, cartoes);
    return [
      html`✅ <b>Gasto registrado!</b>`,
      html``,
      html`${comEmoji(g.categoria)}`,
      html`💰 ${g.valor.formatar()}`,
      html`📝 ${g.descricao}`,
      html`📅 ${dataRelativa(g.dataGasto, hoje)}`,
      ...(forma ? [html`💳 ${forma}`] : []),
    ];
  }
  const [e] = r.entradas;
  if (e) {
    return [
      html`✅ <b>Entrada registrada!</b>`,
      html``,
      html`💰 ${rotuloEntrada(e)}`,
      html`💵 ${e.valor.formatar()}`,
      html`📝 ${e.descricao}`,
      html`📅 ${dataRelativa(e.dataEntrada, hoje)}`,
      ...(e.vinculo
        ? [
            html`💳 Abate a fatura ${nomeDoCartao(cartoes, e.vinculo.cartaoId)} ${mesCurto(e.vinculo.mesFatura)}`,
          ]
        : []),
    ];
  }
  const [p] = r.parcelamentos;
  return p
    ? [
        html`✅ <b>Parcelamento registrado!</b>`,
        html``,
        ...blocoParcelamento(p, cartoes),
      ]
    : [];
}

function tituloDoLote(r: Registro, total: number): Html {
  if (r.gastos.length === total)
    return html`✅ <b>${total} gastos registrados!</b>`;
  if (r.entradas.length === total)
    return html`✅ <b>${total} entradas registradas!</b>`;
  return html`✅ <b>${total} lançamentos registrados!</b>`;
}

function totais(r: Registro, total: number): Html[] {
  const soma = (xs: readonly { valor: Dinheiro }[]) =>
    Dinheiro.deCentavos(xs.reduce((s, x) => s + x.valor.centavos, 0));
  const linhas: Html[] = [];
  if (r.gastos.length > 0)
    linhas.push(
      html`💵 <b>${r.gastos.length === total ? 'Total' : 'Gastos'}: ${soma(r.gastos).formatar()}</b>`,
    );
  if (r.entradas.length > 0)
    linhas.push(
      html`💰 <b>${r.entradas.length === total ? 'Total' : 'Entradas'}: ${soma(r.entradas).formatar()}</b>`,
    );
  return linhas;
}

export function formatarRegistro(r: Registro, hoje: string): Html {
  const total = r.gastos.length + r.entradas.length + r.parcelamentos.length;
  const avisos = r.avisos.map((a) => AVISOS[a]);
  const corpo =
    total === 1
      ? registroUnico(r, hoje)
      : [
          tituloDoLote(r, total),
          html``,
          ...r.gastos.flatMap((g) => blocoGasto(g, r.cartoes, hoje)),
          ...r.entradas.flatMap((e) => blocoEntrada(e, r.cartoes, hoje)),
          ...r.parcelamentos.flatMap((p) => blocoParcelamento(p, r.cartoes)),
          html``,
          ...totais(r, total),
        ];
  return juntarHtml([...corpo, ...(avisos.length ? [html``, ...avisos] : [])]);
}

/** Pergunta da escolha pendente; as opções vão nos botões (Task 16). */
export function formatarEscolha(escolha: Escolha): Html {
  return escolha.tipo === 'forma'
    ? html`💳 Foi no crédito ou no débito?`
    : html`💳 Em qual cartão?`;
}

const PERGUNTA_CONFIRMA = 'Confirma?';

/** Uma linha por item na correção: emoji, valor, descrição, data e pagamento. */
function linhaDaEdicao(
  item: Gasto | Entrada,
  cartoes: ReadonlyMap<string, Cartao>,
  hoje: string,
): string {
  if (item instanceof Entrada)
    return `💰 ${item.valor.formatar()} · ${item.descricao} · ${dataRelativa(item.dataEntrada, hoje)}`;
  const pagamento = rotuloDoPagamento(item, cartoes);
  const resto = pagamento ? ` · ${pagamento.cartao} ${pagamento.forma}` : '';
  return `${EMOJI_CATEGORIA[item.categoria]} ${item.valor.formatar()} · ${item.descricao} · ${dataRelativa(item.dataGasto, hoje)}${resto}`;
}

/** Proposta de correção: só o que muda (🔄 antes ➡️ depois, ➖ removidos, ➕ acrescentados). */
export function formatarEdicao(proposta: PropostaDeEdicao, hoje: string): Html {
  const { antes, depois, removidos, acrescentados, cartoes } = proposta;
  const linha = (item: Gasto | Entrada) => linhaDaEdicao(item, cartoes, hoje);
  const alterados = depois
    .filter((d) => !antes.includes(d))
    .flatMap((d) => {
      const original = antes.find((a) => a.id === d.id);
      return original
        ? [html`🔄 ${linha(original)}`, html`     ➡️ ${linha(d)}`]
        : [];
    });
  return juntarHtml([
    html`✏️ <b>Correção do registro</b>`,
    html``,
    ...alterados,
    ...removidos.map((r) => html`➖ ${linha(r)}`),
    ...acrescentados.map((a) => html`➕ ${linha(a)}`),
    html``,
    html`${PERGUNTA_CONFIRMA}`,
  ]);
}

/** Desfecho anexado à proposta (texto cru do Telegram), sem a pergunta final. */
export function formatarDesfechoDaEdicao(
  propostaOriginal: string,
  desfecho: Html,
): Html {
  const semPergunta = propostaOriginal.trimEnd().endsWith(PERGUNTA_CONFIRMA)
    ? propostaOriginal.trimEnd().slice(0, -PERGUNTA_CONFIRMA.length)
    : propostaOriginal;
  return comDesfecho(semPergunta, desfecho);
}

/** Mantém a legenda do documento dentro de 1024 caracteres (limite do Telegram). */
const MAX_TRANSCRICAO = 500;

/** Prefixa o HTML com a transcrição (cortada e escapada); vazia não gera a linha. */
export function comTranscricao(transcricao: string, corpo: Html): Html {
  if (!transcricao) return corpo;
  const letras = Array.from(transcricao);
  const curta =
    letras.length > MAX_TRANSCRICAO
      ? `${letras.slice(0, MAX_TRANSCRICAO - 1).join('')}…`
      : transcricao;
  return html`🎙️ Entendi: "${curta}"\n\n${[corpo]}`;
}

export function formatarSemGastoNoAudio(transcricao: string): Html {
  return comTranscricao(transcricao, MENSAGEM_NENHUM_GASTO);
}

export function formatarResumo(
  periodo: Periodo,
  resumo: ResumoDoPeriodo,
): Html {
  const { compras, parcelas, entradas, faturas } = resumo;
  const qtdGastos = (compras?.quantidade ?? 0) + parcelas.itens.length;
  const blocoCompras = compras
    ? [
        html``,
        html`<b>Por categoria (compras)</b>`,
        ...compras.porCategoria.map(
          (c) =>
            html`${comEmoji(c.categoria)}: ${c.total.formatar()} (${c.percentual}%)`,
        ),
        html`🏆 Maior gasto: ${compras.maiorGasto.valor.formatar()} · ${rotulo(compras.maiorGasto.categoria)} · ${diaMes(compras.maiorGasto.dataGasto)}`,
      ]
    : [];
  const blocoParcelas = parcelas.itens.length
    ? [
        html``,
        html`🧾 <b>Parcelamentos (${parcelas.itens.length} · ${reais(parcelas.totalCentavos)})</b>`,
        ...parcelas.itens.map(
          (i) =>
            html`${EMOJI_CATEGORIA[i.parcelamento.categoria]} ${i.parcelamento.descricao} · ${i.numero} de ${i.quantidade} · ${i.valor.formatar()} · termina ${mesCurto(i.terminaEm)}`,
        ),
      ]
    : [];
  const blocoFaturas = faturas.length
    ? [
        html``,
        html`💳 <b>Faturas que vencem no período</b>`,
        ...faturas.map(
          (f) =>
            html`${f.cartaoNome} ${mesCurto(f.composicao.mes)} (vence ${diaMes(f.composicao.vencimento)}): ${reais(f.composicao.totalCentavos)}`,
        ),
      ]
    : [];
  return juntarHtml([
    html`📊 <b>Resumo de ${nomeDoPeriodo(periodo)}</b>`,
    html``,
    html`💰 Entradas: ${reais(entradas.totalCentavos)} (${entradas.quantidade})`,
    html`💸 Gastos: ${reais(resumo.totalGastosCentavos)} (${qtdGastos})`,
    html`⚖️ Saldo: ${reais(resumo.saldoCentavos)}`,
    ...blocoCompras,
    ...blocoParcelas,
    ...blocoFaturas,
  ]);
}

export function formatarFatura(cartao: Cartao, c: ComposicaoDaFatura): Html {
  return juntarHtml([
    html`💳 <b>Fatura ${cartao.nome} ${mesCurto(c.mes)}</b> · vence ${dataBr(c.vencimento)}`,
    html``,
    html`Valor inicial: ${reais(c.inicialCentavos)}`,
    html`Compras (${c.compras.quantidade}): ${reais(c.compras.centavos)}`,
    html`Parcelas (${c.parcelas.length}): ${reais(c.parcelasCentavos)}`,
    ...c.parcelas.map(
      (p) =>
        html`• ${p.descricao} · ${p.numero} de ${p.quantidade} · ${p.valor.formatar()}`,
    ),
    html`Reembolsos: ${reais(-c.reembolsosCentavos)}`,
    ...(c.creditoExcedenteCentavos > 0
      ? [html`Crédito a favor: ${reais(c.creditoExcedenteCentavos)}`]
      : []),
    html`<b>Total: ${reais(c.totalCentavos)}</b>`,
  ]);
}

/** Várias faturas, uma por bloco. */
export function formatarFaturas(
  itens: readonly { cartao: Cartao; composicao: ComposicaoDaFatura }[],
): Html {
  return juntarHtml(
    itens.map((i) => formatarFatura(i.cartao, i.composicao)),
    '\n\n',
  );
}

export function formatarFaturaInformada(
  cartao: Cartao,
  fatura: FaturaInformada,
  anterior: FaturaInformada | null,
  c: ComposicaoDaFatura,
): Html {
  const valor = anterior
    ? `${reais(anterior.valorInicial)} → ${reais(fatura.valorInicial)}`
    : reais(fatura.valorInicial);
  return juntarHtml([
    html`💳 <b>Fatura ${cartao.nome} ${mesCurto(fatura.mes)}</b>: valor inicial ${valor}`,
    html`Total atual: ${reais(c.totalCentavos)} · vence ${dataBr(c.vencimento)}`,
  ]);
}

const BLOCOS_MAX = 12;
const BLOCOS_PROPORCIONAIS = 10;

/** `▰` pagas e `▱` restantes; acima de 12 parcelas a barra tem 10 blocos proporcionais. */
export function barraDeProgresso(pagas: number, quantidade: number): string {
  const [blocos, cheios] =
    quantidade <= BLOCOS_MAX
      ? [quantidade, pagas]
      : [
          BLOCOS_PROPORCIONAIS,
          pagas > 0
            ? Math.max(
                1,
                Math.floor((pagas * BLOCOS_PROPORCIONAIS) / quantidade),
              )
            : 0,
        ];
  return '▰'.repeat(cheios) + '▱'.repeat(blocos - cheios);
}

type ItemParcelamento = Awaited<
  ReturnType<ListarParcelamentosUseCase['executar']>
>[number];

export function formatarParcelamentos(
  itens: readonly ItemParcelamento[],
): Html {
  if (itens.length === 0) return html`🧾 Nenhum parcelamento em andamento.`;
  return juntarHtml([
    html`🧾 <b>Parcelamentos em andamento</b>`,
    ...itens.flatMap(({ parcelamento: p, cartao, atual, restantes }) => {
      const pagas = atual?.numero ?? p.parcelaInicial - 1;
      return [
        html``,
        html`${EMOJI_CATEGORIA[p.categoria]} <b>${p.descricao}</b> · ${cartao.nome}`,
        html`${barraDeProgresso(pagas, p.quantidade)} ${pagas} de ${p.quantidade} · faltam ${restantes}`,
        html`${(atual?.valor ?? p.valorParcela).formatar()} por mês · termina ${mesCurto(p.ultimoMesCompetencia)}`,
      ];
    }),
  ]);
}

const AJUDA_CADASTRO_CARTAO = html`Para cadastrar: <code>/cartoes add &lt;nome&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>, por exemplo <code>/cartoes add Inter 3 10</code>.`;

export const MENSAGEM_USO_CARTOES = juntarHtml([
  html`💳 <b>Uso de /cartoes</b>`,
  html`<code>/cartoes</code>: lista os cartões`,
  html`<code>/cartoes add &lt;nome&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>, por exemplo <code>/cartoes add Inter Black 3 10</code>`,
  html`<code>/cartoes remover &lt;nome&gt;</code>`,
]);

export const MENSAGEM_USO_FATURA = juntarHtml([
  html`💳 <b>Uso de /fatura</b>`,
  html`<code>/fatura</code>: próximas faturas de todos os cartões`,
  html`<code>/fatura Inter</code>: próxima fatura do Inter`,
  html`<code>/fatura Inter 400 11/2026</code>: informa o valor inicial (mês opcional)`,
]);

export function formatarCartaoCadastrado(cartao: Cartao): Html {
  return html`💳 Cartão <b>${cartao.nome}</b> cadastrado: fecha dia ${cartao.diaFechamento}, vence dia ${cartao.diaVencimento}.`;
}

export function formatarCartaoRemovido(cartao: Cartao): Html {
  return html`🗑️ Cartão <b>${cartao.nome}</b> removido.`;
}

export function formatarPedidoDeRemocao(p: Parcelamento): Html {
  return html`🗑️ Remover o parcelamento <b>${p.descricao}</b> (${descricaoDoParcelamento(p)})? As parcelas somem das faturas.`;
}

export const MENSAGEM_PARCELAMENTO_REMOVIDO = html`🗑️ Parcelamento removido.`;
export const MENSAGEM_PARCELAMENTO_MANTIDO = html`👍 Parcelamento mantido.`;

export function formatarCartoes(cartoes: readonly Cartao[]): Html {
  if (cartoes.length === 0)
    return juntarHtml([
      html`💳 Você ainda não tem cartões.`,
      AJUDA_CADASTRO_CARTAO,
    ]);
  return juntarHtml([
    html`💳 <b>Seus cartões</b>`,
    html``,
    ...cartoes.map(
      (c) =>
        html`• <b>${c.nome}</b> · fecha dia ${c.diaFechamento} · vence dia ${c.diaVencimento}`,
    ),
    html``,
    AJUDA_CADASTRO_CARTAO,
    html`Para remover: <code>/cartoes remover &lt;nome&gt;</code>.`,
  ]);
}

/** Popups de botão (texto puro): avisam sem editar a mensagem (duplo clique não apaga o resultado do 1º). */
export const POPUP_PENDENCIA_EXPIRADA = '⌛ Essa ação expirou.';
export const POPUP_OPCAO_INVALIDA =
  '🙈 Essa opção não existe. Escolha pelos botões.';
export const POPUP_PARCELAMENTO_INEXISTENTE =
  '🧾 Esse parcelamento não existe mais.';

export const MENSAGEM_PENDENCIA_EXPIRADA = html`⌛ Essa ação expirou. Mande a mensagem de novo.`;
export const MENSAGEM_EDICAO_APLICADA = html`✏️ <b>Registro corrigido!</b>`;
export const MENSAGEM_EDICAO_CANCELADA = html`🚫 Correção cancelada.`;

export function formatarUltimos(gastos: readonly Gasto[], hoje: string): Html {
  const titulo =
    gastos.length === 1
      ? html`🧾 <b>Último gasto</b>`
      : html`🧾 <b>Últimos ${gastos.length} gastos</b>`;
  return juntarHtml([
    titulo,
    html``,
    ...gastos.map(
      (g) =>
        html`${EMOJI_CATEGORIA[g.categoria]} ${dataRelativa(g.dataGasto, hoje)} · ${g.valor.formatar()} · ${g.descricao}`,
    ),
  ]);
}

export function legendaExportacao(periodo: Periodo, quantidade: number): Html {
  return html`📎 Aqui está o seu arquivo de <b>${nomeDoPeriodo(periodo)}</b> (${plural(quantidade, 'gasto', 'gastos')}).`;
}

/** O texto original vem de `message.text` (cru): é escapado e recebe o desfecho embaixo. */
export function comDesfecho(textoOriginal: string, desfecho: Html): Html {
  const original = escaparHtml(textoOriginal.trim());
  return juntarHtml([original, desfecho].filter(Boolean), '\n\n');
}

export function formatarDesfeito(textoOriginal: string): Html {
  return comDesfecho(textoOriginal, html`↩️ <b>Pronto, desfiz o registro.</b>`);
}

const MENSAGENS: [new (...args: never[]) => Error, Html][] = [
  [NenhumGastoEncontradoError, MENSAGEM_NENHUM_GASTO],
  [
    ProvedorIndisponivelError,
    html`😵 Estou com dificuldade para entender agora. Tente em alguns minutos.`,
  ],
  [RespostaInvalidaDaIaError, html`🤔 Não consegui entender. Pode reformular?`],
  [
    ValorAcimaDoTetoError,
    html`⚠️ Esse valor parece alto demais. O limite é R$ 50.000,00 por gasto.`,
  ],
  [ValorInvalidoError, html`⚠️ Não consegui entender o valor.`],
  [
    DataFuturaError,
    html`📅 Essa data não parece certa: o gasto não pode ser no futuro.`,
  ],
  [
    DataForaDaJanelaError,
    html`📅 Essa data não parece certa: só registro gastos de até 1 ano atrás.`,
  ],
  [DataInvalidaError, html`📅 Essa data não parece certa.`],
  [DescricaoVaziaError, html`📝 Faltou dizer com o que foi o gasto.`],
  [PeriodoFuturoError, html`📅 O período informado está no futuro.`],
  [PeriodoInvertidoError, html`📅 A data inicial é depois da data final.`],
  [PeriodoLongoDemaisError, html`📅 O intervalo máximo é de 1 ano.`],
  [NenhumGastoRegistradoError, html`🧾 Você ainda não registrou nenhum gasto.`],
  [DownloadFalhouError, html`🎧 Não consegui baixar o áudio. Tente de novo.`],
  [
    NenhumCartaoCadastradoError,
    html`💳 Você ainda não tem cartões. Cadastre um com <code>/cartoes add &lt;nome&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>`,
  ],
  [CartaoJaExisteError, html`💳 Já existe um cartão com esse nome.`],
  [
    CartaoEmUsoError,
    html`💳 Esse cartão já tem lançamentos e não pode ser removido.`,
  ],
  [CartaoNaoEncontradoError, html`💳 Não encontrei esse cartão.`],
  [
    NomeDeCartaoInvalidoError,
    html`💳 Nome de cartão inválido. Use até 30 caracteres, sem símbolos como &lt; e &gt;.`,
  ],
  [
    DiaInvalidoError,
    html`📅 Os dias de fechamento e vencimento vão de 1 a 31.`,
  ],
  [
    IntervaloDeFaturaInvalidoError,
    html`📅 O vencimento precisa ser de 1 a ${MAX_DIAS_ATE_VENCIMENTO} dias depois do fechamento. Confira a ordem: <code>/cartoes add &lt;nome&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>`,
  ],
  [
    QuantidadeDeParcelasInvalidaError,
    html`🧾 O parcelamento precisa ter de ${MIN_PARCELAS} a ${MAX_PARCELAS} parcelas.`,
  ],
  [
    ParcelaInicialInvalidaError,
    html`🧾 A parcela atual precisa estar entre 1 e o total de parcelas.`,
  ],
  [
    ValorDoParcelamentoAusenteError,
    html`🧾 Faltou o valor: diga o total ou o valor de cada parcela.`,
  ],
  [ParcelamentoSemCreditoError, html`💳 Parcelamento só existe no crédito.`],
  [
    VinculoDeFaturaInvalidoError,
    html`💳 Só dá para abater uma fatura com um reembolso de cartão válido.`,
  ],
  [
    ValorInicialInvalidoError,
    html`⚠️ Valor inicial da fatura inválido. Use de R$ 0,00 a R$ 50.000,00.`,
  ],
  [MesInvalidoError, html`📅 Mês inválido. Use o formato 11/2026.`],
  [PendenciaExpiradaError, MENSAGEM_PENDENCIA_EXPIRADA],
  [EscolhaInvalidaError, html`🙈 Essa opção não existe. Escolha pelos botões.`],
  [CorrecaoVaziaError, html`✏️ Essa correção não muda nada.`],
  [
    RegistroVazioError,
    html`✏️ A correção removeria tudo do registro. Para apagar, use o botão Desfazer.`,
  ],
  [
    IndiceDeCorrecaoInvalidoError,
    html`✏️ O número citado não existe nesse registro.`,
  ],
  [
    EscolhaNecessariaNaEdicaoError,
    html`💳 Diga se foi no crédito ou no débito (e o cartão, se houver mais de um).`,
  ],
  [
    RegistroAlteradoError,
    html`🧾 Esse registro foi alterado ou apagado enquanto eu corrigia.`,
  ],
];

/** Popup do botão (texto puro, sem HTML): o Desfazer só falha por erro inesperado. */
export const MENSAGEM_FALHA_AO_DESFAZER =
  '🛠️ Não consegui desfazer agora. Tente de novo.';

export const MENSAGEM_ERRO_INESPERADO = html`🛠️ Algo deu errado do meu lado. Já registrei o problema.`;

/**
 * Mensagem amigável (HTML); nunca expõe a mensagem interna do erro. Fora do
 * mapa de propósito (bug, não erro do usuário; caem no inesperado e são
 * logados): `PagamentoInvalidoError` e `RegistroIdVazioError`.
 */
export function mensagemDeErro(erro: unknown): Html {
  if (erro instanceof NenhumGastoNoPeriodoError) {
    const { periodo } = erro;
    if (periodo.tipo === 'mes')
      return html`🗓️ Nenhum gasto registrado em <b>${nomeDoPeriodo(periodo)}</b>.`;
    const onde =
      periodo.tipo === 'dia' ? 'na data informada' : 'no intervalo informado';
    return html`🗓️ Nenhum gasto registrado ${onde} (<b>${periodo.descrever()}</b>).`;
  }
  if (erro instanceof CartaoNaoCadastradoError)
    return html`💳 O cartão <b>${erro.nome}</b> não está cadastrado. Use <code>/cartoes add ${erro.nome} &lt;fechamento&gt; &lt;vencimento&gt;</code>`;
  if (erro instanceof EscolhaDeCartaoNecessariaError)
    return html`💳 Qual cartão? Você tem: <b>${erro.opcoes.join(', ')}</b>.`;
  if (erro instanceof RegistroNaoEncontradoError)
    return erro.soParcelamento
      ? html`🧾 Parcelamentos se corrigem por /parcelamentos.`
      : html`🧾 Não encontrei gastos nem entradas nesse registro.`;
  const par = MENSAGENS.find(([Classe]) => erro instanceof Classe);
  return par ? par[1] : MENSAGEM_ERRO_INESPERADO;
}
