import { InlineKeyboard, InputFile } from 'grammy';
import {
  EscolhaInvalidaError,
  NenhumGastoEncontradoError,
  PendenciaExpiradaError,
} from '../../application/errors.js';
import type { ArquivoExportado } from '../../application/ports/exportador.js';
import type { EntradaMensagem } from '../../application/ports/interpretador-de-mensagem.js';
import type { Relogio } from '../../application/ports/relogio.js';
import type {
  CadastrarCartaoUseCase,
  ListarCartoesUseCase,
  RemoverCartaoUseCase,
} from '../../application/use-cases/cartoes.use-cases.js';
import type { ConcluirRegistroPendenteUseCase } from '../../application/use-cases/concluir-registro-pendente.use-case.js';
import type { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import type {
  CancelarEdicaoUseCase,
  ConfirmarEdicaoUseCase,
  PrepararEdicaoUseCase,
} from '../../application/use-cases/edicao.use-cases.js';
import type { ExportarPeriodoUseCase } from '../../application/use-cases/exportar-periodo.use-case.js';
import type {
  ConsultarFaturaUseCase,
  InformarFaturaUseCase,
} from '../../application/use-cases/faturas.use-cases.js';
import type { ListarUltimosGastosUseCase } from '../../application/use-cases/listar-ultimos-gastos.use-case.js';
import type {
  ListarParcelamentosUseCase,
  RemoverParcelamentoUseCase,
} from '../../application/use-cases/parcelamentos.use-cases.js';
import type {
  ProcessarMensagemUseCase,
  ResultadoProcessamento,
} from '../../application/use-cases/processar-mensagem.use-case.js';
import type {
  OpcaoDeEscolha,
  Escolha,
  ResultadoRegistro,
} from '../../application/use-cases/registrar-lancamentos.use-case.js';
import type { ResumirPeriodoUseCase } from '../../application/use-cases/resumir-periodo.use-case.js';
import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import {
  CALLBACK_MANTER_PARCELAMENTO,
  lerCallbackCancelarEdicao,
  lerCallbackCartao,
  lerCallbackConfirmarEdicao,
  lerCallbackConfirmarRemocao,
  lerCallbackDesfazer,
  lerCallbackExportar,
  lerCallbackForma,
  lerCallbackManterParcelamento,
  lerCallbackPedirRemocao,
  MAX_OPCOES_DE_CARTAO,
  montarCallbackCancelarEdicao,
  montarCallbackCartao,
  montarCallbackConfirmarEdicao,
  montarCallbackConfirmarRemocao,
  montarCallbackDesfazer,
  montarCallbackExportar,
  montarCallbackForma,
  montarCallbackPedirRemocao,
  PREFIXO_DESFAZER,
} from './callback.js';
import { DownloadFalhouError } from './download.js';
import {
  comTranscricao,
  formatarCartaoCadastrado,
  formatarCartaoRemovido,
  formatarCartoes,
  formatarDesfeito,
  formatarDesfechoDaEdicao,
  formatarEdicao,
  formatarEscolha,
  formatarRegistro,
  formatarFaturaInformada,
  formatarFaturas,
  formatarParcelamentos,
  formatarPedidoDeRemocao,
  formatarResumo,
  formatarSemGastoNoAudio,
  formatarUltimos,
  legendaExportacao,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_COMANDO_DESCONHECIDO,
  MENSAGEM_EDICAO_APLICADA,
  MENSAGEM_EDICAO_CANCELADA,
  MENSAGEM_ESCOLHER_MES_EXPORTAR,
  MENSAGEM_NAO_SUPORTADO,
  MENSAGEM_FALHA_AO_DESFAZER,
  MENSAGEM_PARCELAMENTO_MANTIDO,
  MENSAGEM_PARCELAMENTO_REMOVIDO,
  MENSAGEM_TEXTO_LONGO,
  MENSAGEM_USO_CARTOES,
  MENSAGEM_USO_FATURA,
  mensagemDeErro,
  POPUP_OPCAO_INVALIDA,
  POPUP_PARCELAMENTO_INEXISTENTE,
  POPUP_PENDENCIA_EXPIRADA,
} from './formatador.js';
import { html, juntarHtml, type Html } from './html.js';

export interface DepsTelegram {
  processar: Pick<ProcessarMensagemUseCase, 'executar'>;
  exportar: Pick<ExportarPeriodoUseCase, 'executar'>;
  resumir: Pick<ResumirPeriodoUseCase, 'executar'>;
  listarUltimos: Pick<ListarUltimosGastosUseCase, 'executar'>;
  desfazer: Pick<DesfazerRegistroUseCase, 'executar'>;
  concluirRegistro: Pick<
    ConcluirRegistroPendenteUseCase,
    'executar' | 'executarPorIndice'
  >;
  prepararEdicao: Pick<PrepararEdicaoUseCase, 'executar'>;
  confirmarEdicao: Pick<ConfirmarEdicaoUseCase, 'executar'>;
  cancelarEdicao: Pick<CancelarEdicaoUseCase, 'executar'>;
  cadastrarCartao: Pick<CadastrarCartaoUseCase, 'executar'>;
  listarCartoes: Pick<ListarCartoesUseCase, 'executar'>;
  removerCartao: Pick<RemoverCartaoUseCase, 'executar'>;
  consultarFatura: Pick<ConsultarFaturaUseCase, 'executar'>;
  informarFatura: Pick<InformarFaturaUseCase, 'executar'>;
  listarParcelamentos: Pick<ListarParcelamentosUseCase, 'executar'>;
  removerParcelamento: Pick<RemoverParcelamentoUseCase, 'executar'>;
  logger: { error(mensagem: string): void };
  relogio: Relogio;
  baixarArquivo(filePath: string): Promise<Buffer>;
}

/**
 * O que os handlers usam para responder; o parse_mode HTML vem do transformer
 * `comHtml`. Só aceita `Html`: texto cru precisa passar pelo escape. O popup
 * (`answerCallbackQuery`) é texto puro e fica `string`.
 */
export interface CtxResposta {
  reply(
    texto: Html,
    extra?: { reply_markup?: InlineKeyboard },
  ): Promise<unknown>;
  replyWithDocument(
    doc: InputFile,
    extra?: { caption?: Html },
  ): Promise<unknown>;
}

/** Só o necessário da mensagem respondida: o teclado (com `text`, para não ser tipo "fraco"). */
interface MensagemRespondida {
  reply_to_message?: {
    from?: { id: number };
    reply_markup?: {
      inline_keyboard: readonly (readonly {
        text: string;
        callback_data?: string;
      }[])[];
    };
  };
}

/** Contexto de mensagem: `me` é o próprio bot (para reconhecer a resposta a uma mensagem dele). */
interface CtxMensagem extends CtxResposta {
  me: { id: number };
}

export interface CtxTexto extends CtxMensagem {
  msg: { text: string } & MensagemRespondida;
}

export interface CtxVoz extends CtxMensagem {
  msg: { voice: { duration: number; file_size?: number } } & MensagemRespondida;
  getFile(): Promise<{ file_path?: string }>;
}

export interface CtxComando extends CtxResposta {
  match: string;
}

export interface CtxCallback extends CtxResposta {
  callbackQuery: { data?: string; message?: { text?: string } };
  answerCallbackQuery(texto?: string): Promise<unknown>;
  editMessageText(
    texto: Html,
    extra?: { reply_markup?: InlineKeyboard },
  ): Promise<unknown>;
  editMessageReplyMarkup(): Promise<unknown>;
}

const hojeDe = (deps: DepsTelegram): string =>
  hojeEmSaoPaulo(deps.relogio.agora());

function tecladoDesfazer(registroId: string): InlineKeyboard {
  return new InlineKeyboard().text(
    '↩️ Desfazer',
    montarCallbackDesfazer(registroId),
  );
}

/** Pergunta de escolha: forma (`f:`) ou cartão pelo índice da opção (`k:`), um por linha. */
function tecladoEscolha(r: {
  pendenteId: string;
  escolha: Escolha;
  opcoes: readonly OpcaoDeEscolha[];
}): InlineKeyboard {
  const teclado = new InlineKeyboard();
  if (r.escolha.tipo === 'forma') {
    for (const o of r.opcoes)
      if (o.valor === 'credito' || o.valor === 'debito')
        teclado.text(o.rotulo, montarCallbackForma(r.pendenteId, o.valor));
    return teclado;
  }
  // ponytail: mais de 10 cartões some do teclado; paginar se um dia existir.
  for (const [i, o] of r.opcoes.slice(0, MAX_OPCOES_DE_CARTAO).entries())
    teclado.text(o.rotulo, montarCallbackCartao(r.pendenteId, i)).row();
  return teclado;
}

function tecladoEdicao(pendenteId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirmar', montarCallbackConfirmarEdicao(pendenteId))
    .text('❌ Cancelar', montarCallbackCancelarEdicao(pendenteId));
}

/**
 * `registroId` do botão Desfazer de uma mensagem **do próprio bot** que foi
 * respondida; `null` em qualquer outro caso (fluxo normal).
 */
function registroRespondido(
  ctx: CtxMensagem & { msg: MensagemRespondida },
): string | null {
  const respondida = ctx.msg.reply_to_message;
  if (respondida?.from?.id !== ctx.me.id) return null;
  const linhas = respondida.reply_markup?.inline_keyboard ?? [];
  for (const botao of linhas.flat()) {
    const id = lerCallbackDesfazer(botao.callback_data);
    if (id) return id;
  }
  return null;
}

const nada = (): undefined => undefined;

function ehErroConhecido(erro: unknown): boolean {
  return mensagemDeErro(erro) !== mensagemDeErro(undefined);
}

function logarSeInesperado(
  erro: unknown,
  deps: DepsTelegram,
  onde: string,
): void {
  if (ehErroConhecido(erro)) return;
  // Só o nome: message e stack podem conter o texto do usuário.
  deps.logger.error(
    `Erro inesperado em ${onde}: ${erro instanceof Error ? erro.name : typeof erro}`,
  );
}

async function responderErro(
  ctx: CtxResposta,
  erro: unknown,
  deps: DepsTelegram,
  onde: string,
): Promise<void> {
  logarSeInesperado(erro, deps, onde);
  await ctx.reply(mensagemDeErro(erro));
}

async function enviarDocumentos(
  ctx: CtxResposta,
  arquivos: readonly ArquivoExportado[],
  legenda: Html,
): Promise<void> {
  for (const [i, arquivo] of arquivos.entries()) {
    await ctx.replyWithDocument(
      new InputFile(arquivo.conteudo, arquivo.nomeArquivo),
      i === 0 ? { caption: legenda } : {},
    );
  }
}

/** Traduz o resultado em resposta; `transcricao` (voz) prefixa o texto ou a legenda. */
export async function responder(
  ctx: CtxResposta,
  resultado: ResultadoProcessamento,
  hoje: string,
  transcricao?: string,
): Promise<void> {
  const comVoz = (texto: Html): Html =>
    transcricao === undefined ? texto : comTranscricao(transcricao, texto);
  switch (resultado.tipo) {
    case 'registro':
      await ctx.reply(comVoz(formatarRegistro(resultado, hoje)), {
        reply_markup: tecladoDesfazer(resultado.registroId),
      });
      return;
    case 'escolha':
      await ctx.reply(comVoz(formatarEscolha(resultado.escolha)), {
        reply_markup: tecladoEscolha(resultado),
      });
      return;
    case 'exportacao':
      await enviarDocumentos(
        ctx,
        resultado.arquivos,
        comVoz(legendaExportacao(resultado.periodo, resultado.quantidade)),
      );
      return;
    case 'resumo':
      await ctx.reply(
        comVoz(formatarResumo(resultado.periodo, resultado.resumo)),
      );
      return;
    case 'ultimos':
      await ctx.reply(comVoz(formatarUltimos(resultado.gastos, hoje)));
      return;
    case 'fatura-informada':
      await ctx.reply(
        comVoz(
          formatarFaturaInformada(
            resultado.cartao,
            resultado.fatura,
            resultado.anterior,
            resultado.composicao,
          ),
        ),
      );
      return;
    case 'faturas':
      await ctx.reply(comVoz(formatarFaturas(resultado.itens)));
      return;
  }
}

/** Prepara a correção do registro e responde a proposta com Confirmar/Cancelar. */
async function proporCorrecao(
  ctx: CtxResposta,
  registroId: string,
  entrada: EntradaMensagem,
  deps: DepsTelegram,
): Promise<void> {
  const { pendenteId, proposta, transcricao } =
    await deps.prepararEdicao.executar(registroId, entrada);
  const corpo = formatarEdicao(proposta, hojeDe(deps));
  await ctx.reply(
    transcricao === undefined ? corpo : comTranscricao(transcricao, corpo),
    { reply_markup: tecladoEdicao(pendenteId) },
  );
}

/**
 * Texto já sem espaços nas pontas: aplica o limite e processa; com
 * `registroId` (resposta a um registro) vira correção.
 */
async function processarTexto(
  ctx: CtxResposta,
  texto: string,
  deps: DepsTelegram,
  onde: string,
  registroId: string | null = null,
): Promise<void> {
  if (texto.length > MAX_CARACTERES_TEXTO) {
    await ctx.reply(MENSAGEM_TEXTO_LONGO);
    return;
  }
  const entrada: EntradaMensagem = { tipo: 'texto', texto };
  try {
    if (registroId) await proporCorrecao(ctx, registroId, entrada, deps);
    else
      await responder(
        ctx,
        await deps.processar.executar(entrada),
        hojeDe(deps),
      );
  } catch (erro) {
    await responderErro(ctx, erro, deps, onde);
  }
}

export async function tratarTexto(
  ctx: CtxTexto,
  deps: DepsTelegram,
): Promise<void> {
  const texto = ctx.msg.text.trim();
  if (texto === '') return;
  if (texto.startsWith('/')) {
    await ctx.reply(MENSAGEM_COMANDO_DESCONHECIDO);
    return;
  }
  await processarTexto(
    ctx,
    texto,
    deps,
    'tratarTexto',
    registroRespondido(ctx),
  );
}

async function baixarVoz(ctx: CtxVoz, deps: DepsTelegram): Promise<Buffer> {
  let caminho: string | undefined;
  try {
    caminho = (await ctx.getFile()).file_path;
  } catch {
    throw new DownloadFalhouError();
  }
  if (!caminho) throw new DownloadFalhouError();
  return deps.baixarArquivo(caminho);
}

export async function tratarVoz(
  ctx: CtxVoz,
  deps: DepsTelegram,
): Promise<void> {
  const { duration, file_size } = ctx.msg.voice;
  if (duration > MAX_DURACAO_AUDIO_S) {
    await ctx.reply(MENSAGEM_AUDIO_LONGO);
    return;
  }
  if ((file_size ?? 0) > MAX_BYTES_AUDIO) {
    await ctx.reply(MENSAGEM_AUDIO_GRANDE);
    return;
  }
  try {
    const entrada: EntradaMensagem = {
      tipo: 'audio',
      audio: await baixarVoz(ctx, deps),
      mimeType: 'audio/ogg',
    };
    const registroId = registroRespondido(ctx);
    if (registroId) {
      await proporCorrecao(ctx, registroId, entrada, deps);
      return;
    }
    const resultado = await deps.processar.executar(entrada);
    await responder(ctx, resultado, hojeDe(deps), resultado.textoOriginal);
  } catch (erro) {
    const ouvido =
      erro instanceof NenhumGastoEncontradoError
        ? erro.textoOriginal?.trim()
        : undefined;
    if (ouvido) {
      await ctx.reply(formatarSemGastoNoAudio(ouvido));
      return;
    }
    await responderErro(ctx, erro, deps, 'tratarVoz');
  }
}

export async function tratarComandoExportar(
  ctx: CtxComando,
  deps: DepsTelegram,
): Promise<void> {
  const argumento = ctx.match.trim();
  if (argumento === '') {
    await ctx.reply(MENSAGEM_ESCOLHER_MES_EXPORTAR, {
      reply_markup: new InlineKeyboard()
        .text('Mês atual', montarCallbackExportar(0))
        .text('Mês anterior', montarCallbackExportar(-1)),
    });
    return;
  }
  await processarTexto(
    ctx,
    `exportar ${argumento}`,
    deps,
    'tratarComandoExportar',
  );
}

const MES_AAAA_MM = /^\d{4}-\d{2}$/;

export async function tratarComandoResumo(
  ctx: CtxComando,
  deps: DepsTelegram,
): Promise<void> {
  const argumento = ctx.match.trim();
  if (argumento !== '' && !MES_AAAA_MM.test(argumento)) {
    await processarTexto(
      ctx,
      `resumo ${argumento}`,
      deps,
      'tratarComandoResumo',
    );
    return;
  }
  try {
    const { periodo, resumo } = await deps.resumir.executar(
      argumento === '' ? { mesRelativo: 0 } : { mes: argumento },
    );
    await ctx.reply(formatarResumo(periodo, resumo));
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoResumo');
  }
}

export async function tratarComandoUltimos(
  ctx: CtxResposta,
  deps: DepsTelegram,
): Promise<void> {
  try {
    await ctx.reply(
      formatarUltimos(await deps.listarUltimos.executar(), hojeDe(deps)),
    );
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoUltimos');
  }
}

/** Tokens separados por espaço, sem vazios. */
const tokens = (texto: string): string[] =>
  texto.trim().split(/\s+/).filter(Boolean);
const DIA = /^\d{1,2}$/;

/** `/cartoes`, `/cartoes add <nome…> <fechamento> <vencimento>`, `/cartoes remover <nome…>`. */
export async function tratarComandoCartoes(
  ctx: CtxComando,
  deps: DepsTelegram,
): Promise<void> {
  const [sub, ...resto] = tokens(ctx.match);
  try {
    if (sub === undefined) {
      await ctx.reply(formatarCartoes(await deps.listarCartoes.executar()));
      return;
    }
    const acao = sub.toLowerCase();
    // Os dois últimos tokens são os dias; o resto é o nome (pode ter espaço).
    const [fechamento, vencimento] = resto.slice(-2);
    if (
      acao === 'add' &&
      resto.length >= 3 &&
      DIA.test(fechamento ?? '') &&
      DIA.test(vencimento ?? '')
    ) {
      const cartao = await deps.cadastrarCartao.executar({
        nome: resto.slice(0, -2).join(' '),
        diaFechamento: Number(fechamento),
        diaVencimento: Number(vencimento),
      });
      await ctx.reply(formatarCartaoCadastrado(cartao));
      return;
    }
    if (acao === 'remover' && resto.length > 0) {
      await ctx.reply(
        formatarCartaoRemovido(
          await deps.removerCartao.executar(resto.join(' ')),
        ),
      );
      return;
    }
    await ctx.reply(MENSAGEM_USO_CARTOES);
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoCartoes');
  }
}

const MES_MM_AAAA = /^(\d{1,2})\/(\d{4})$/;
const PARECE_VALOR = /^\d[\d.,]*$/;
const ZERO = /^0+([.,]0{1,2})?$/;

/** `deTexto` recusa zero, que zera o valor inicial da fatura. */
const reaisDoTexto = (texto: string): number =>
  ZERO.test(texto) ? 0 : Dinheiro.deTexto(texto).centavos / 100;

/**
 * `/fatura [<nome…>] [<valor>] [MM/AAAA]`: com valor informa o valor inicial;
 * sem valor consulta. Nome terminado em número é lido como valor.
 */
export async function tratarComandoFatura(
  ctx: CtxComando,
  deps: DepsTelegram,
): Promise<void> {
  const partes = tokens(ctx.match);
  const data = MES_MM_AAAA.exec(partes.at(-1) ?? '');
  if (data) partes.pop();
  const mes = data ? `${data[2]}-${data[1]!.padStart(2, '0')}` : null;
  const valor = PARECE_VALOR.test(partes.at(-1) ?? '') ? partes.pop()! : null;
  const cartao = partes.join(' ') || null;
  try {
    if (valor !== null) {
      const r = await deps.informarFatura.executar({
        cartao,
        mes,
        valorReais: reaisDoTexto(valor),
      });
      await ctx.reply(
        formatarFaturaInformada(r.cartao, r.fatura, r.anterior, r.composicao),
      );
      return;
    }
    if (cartao === null && mes !== null) {
      await ctx.reply(MENSAGEM_USO_FATURA);
      return;
    }
    await ctx.reply(
      formatarFaturas(await deps.consultarFatura.executar({ cartao, mes })),
    );
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoFatura');
  }
}

const MAX_PARCELAMENTOS_LISTADOS = 10;

/** Lista os parcelamentos ativos (até 10) com um botão 🗑️ por item. */
export async function tratarComandoParcelamentos(
  ctx: CtxResposta,
  deps: DepsTelegram,
): Promise<void> {
  try {
    const todos = await deps.listarParcelamentos.executar();
    const itens = todos.slice(0, MAX_PARCELAMENTOS_LISTADOS);
    if (itens.length === 0) {
      await ctx.reply(formatarParcelamentos(itens));
      return;
    }
    const omitidos = todos.length - itens.length;
    const lista =
      omitidos > 0
        ? juntarHtml(
            [
              formatarParcelamentos(itens),
              html`+${omitidos} parcelamento(s) não listado(s); mostrando os ${itens.length} primeiros.`,
            ],
            '\n\n',
          )
        : formatarParcelamentos(itens);
    const teclado = new InlineKeyboard();
    for (const { parcelamento: p } of itens)
      teclado.text(`🗑️ ${p.descricao}`, montarCallbackPedirRemocao(p.id)).row();
    await ctx.reply(lista, { reply_markup: teclado });
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoParcelamentos');
  }
}

export async function tratarDesfazer(
  ctx: CtxCallback,
  deps: DepsTelegram,
): Promise<void> {
  const registroId = lerCallbackDesfazer(ctx.callbackQuery.data);
  if (!registroId) {
    await ctx.answerCallbackQuery('Ação inválida');
    return;
  }
  let removidos: number;
  try {
    removidos = await deps.desfazer.executar(registroId);
  } catch (erro) {
    logarSeInesperado(erro, deps, 'tratarDesfazer');
    await ctx.answerCallbackQuery(MENSAGEM_FALHA_AO_DESFAZER);
    return;
  }
  // O registro já foi decidido: falha ao editar a mensagem não pode virar "erro".
  try {
    if (removidos > 0) {
      const original = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(formatarDesfeito(original));
    } else {
      await ctx.editMessageReplyMarkup();
    }
  } catch (erro) {
    logarSeInesperado(erro, deps, 'tratarDesfazer');
  }
  await ctx.answerCallbackQuery(
    removidos > 0 ? 'Desfeito' : 'Nada para desfazer (expirado ou já desfeito)',
  );
}

async function tratarExportarDoBotao(
  ctx: CtxCallback,
  mesRelativo: 0 | -1,
  deps: DepsTelegram,
): Promise<void> {
  // Responde antes de gerar: tira o spinner do botão. É cosmético: um callback
  // velho ("query is too old") não pode abortar a exportação.
  await ctx.answerCallbackQuery('Gerando arquivos…').catch(() => undefined);
  try {
    const { periodo, quantidade, arquivos } = await deps.exportar.executar({
      mesRelativo,
    });
    await enviarDocumentos(
      ctx,
      arquivos,
      legendaExportacao(periodo, quantidade),
    );
  } catch (erro) {
    logarSeInesperado(erro, deps, 'tratarCallback');
    // O callback já foi respondido: o erro vai para o chat.
    await ctx.reply(mensagemDeErro(erro));
  }
}

/**
 * Erros de clique repetido ou opção inexistente viram só popup: editar a
 * mensagem apagaria o resultado do 1º clique (registro e Desfazer).
 */
function popupDoErro(erro: unknown): string | null {
  if (erro instanceof PendenciaExpiradaError) return POPUP_PENDENCIA_EXPIRADA;
  if (erro instanceof EscolhaInvalidaError) return POPUP_OPCAO_INVALIDA;
  return null;
}

/** Edita a mensagem do botão; se não der, manda o mesmo conteúdo numa mensagem nova. */
async function editarOuResponder(
  ctx: CtxCallback,
  texto: Html,
  teclado?: InlineKeyboard,
): Promise<void> {
  const extra = teclado ? [{ reply_markup: teclado }] : [];
  try {
    await ctx.editMessageText(texto, ...extra);
  } catch {
    await ctx.reply(texto, ...extra);
  }
}

/**
 * Resposta a uma escolha: conclui e edita a pergunta para o registro (com
 * Desfazer) ou para a próxima pergunta. Outros erros substituem a pergunta
 * pela mensagem amigável.
 */
async function tratarEscolha(
  ctx: CtxCallback,
  concluir: () => Promise<ResultadoRegistro>,
  deps: DepsTelegram,
): Promise<void> {
  let resultado: ResultadoRegistro;
  try {
    resultado = await concluir();
  } catch (erro) {
    const popup = popupDoErro(erro);
    await ctx.answerCallbackQuery(popup ?? undefined).catch(nada);
    if (popup) return;
    logarSeInesperado(erro, deps, 'tratarEscolha');
    await ctx.editMessageText(mensagemDeErro(erro)).catch(nada);
    return;
  }
  await ctx.answerCallbackQuery().catch(nada);
  if (resultado.tipo === 'registrado')
    await editarOuResponder(
      ctx,
      formatarRegistro(resultado, hojeDe(deps)),
      tecladoDesfazer(resultado.registroId),
    );
  else
    await editarOuResponder(
      ctx,
      formatarEscolha(resultado.escolha),
      tecladoEscolha(resultado),
    );
}

/** Confirma ou cancela a correção e anexa o desfecho à proposta (sem a pergunta). */
async function tratarDecisaoDeEdicao(
  ctx: CtxCallback,
  decidir: () => Promise<Html>,
  deps: DepsTelegram,
): Promise<void> {
  let desfecho: Html;
  try {
    desfecho = await decidir();
  } catch (erro) {
    const popup = popupDoErro(erro);
    if (popup) {
      await ctx.answerCallbackQuery(popup).catch(nada);
      return;
    }
    logarSeInesperado(erro, deps, 'tratarDecisaoDeEdicao');
    desfecho = mensagemDeErro(erro);
  }
  await ctx.answerCallbackQuery().catch(nada);
  const original = ctx.callbackQuery.message?.text ?? '';
  await editarOuResponder(ctx, formatarDesfechoDaEdicao(original, desfecho));
}

async function tratarPedidoDeRemocao(
  ctx: CtxCallback,
  id: string,
  deps: DepsTelegram,
): Promise<void> {
  try {
    const item = (await deps.listarParcelamentos.executar()).find(
      (i) => i.parcelamento.id === id,
    );
    if (!item) {
      await ctx.answerCallbackQuery(POPUP_PARCELAMENTO_INEXISTENTE).catch(nada);
      return;
    }
    await ctx.answerCallbackQuery().catch(nada);
    await ctx.reply(formatarPedidoDeRemocao(item.parcelamento), {
      reply_markup: new InlineKeyboard()
        .text('🗑️ Remover', montarCallbackConfirmarRemocao(id))
        .text('Manter', CALLBACK_MANTER_PARCELAMENTO),
    });
  } catch (erro) {
    await ctx.answerCallbackQuery().catch(nada);
    await responderErro(ctx, erro, deps, 'tratarPedidoDeRemocao');
  }
}

async function tratarRemocaoConfirmada(
  ctx: CtxCallback,
  id: string,
  deps: DepsTelegram,
): Promise<void> {
  let mensagem: Html;
  try {
    if (!(await deps.removerParcelamento.executar(id))) {
      // Já removido (2º clique): não sobrescreve o "removido" do 1º.
      await ctx.answerCallbackQuery(POPUP_PARCELAMENTO_INEXISTENTE).catch(nada);
      return;
    }
    mensagem = MENSAGEM_PARCELAMENTO_REMOVIDO;
  } catch (erro) {
    logarSeInesperado(erro, deps, 'tratarRemocaoConfirmada');
    mensagem = mensagemDeErro(erro);
  }
  await ctx.answerCallbackQuery().catch(nada);
  await ctx.editMessageText(mensagem).catch(nada);
}

async function tratarManterParcelamento(ctx: CtxCallback): Promise<void> {
  await ctx.answerCallbackQuery().catch(nada);
  await ctx.editMessageText(MENSAGEM_PARCELAMENTO_MANTIDO).catch(nada);
}

type Tratador = (ctx: CtxCallback, deps: DepsTelegram) => Promise<void>;
/** Lê o callback; se for dela, devolve quem trata. */
type Rota = (data: string | undefined) => Tratador | null;

/** Liga um leitor (que valida o formato inteiro) ao seu tratador. */
function rota<T>(
  ler: (data: string | undefined) => T | null,
  tratar: (ctx: CtxCallback, valor: T, deps: DepsTelegram) => Promise<void>,
): Rota {
  return (data) => {
    const valor = ler(data);
    return valor === null ? null : (ctx, deps) => tratar(ctx, valor, deps);
  };
}

const ROTAS: readonly Rota[] = [
  rota(
    (d) => (d?.startsWith(PREFIXO_DESFAZER) ? d : null),
    (ctx, _, deps) => tratarDesfazer(ctx, deps),
  ),
  rota(lerCallbackExportar, tratarExportarDoBotao),
  rota(lerCallbackForma, (ctx, { pendenteId, valor }, deps) =>
    tratarEscolha(
      ctx,
      () => deps.concluirRegistro.executar(pendenteId, valor),
      deps,
    ),
  ),
  rota(lerCallbackCartao, (ctx, { pendenteId, indice }, deps) =>
    tratarEscolha(
      ctx,
      () => deps.concluirRegistro.executarPorIndice(pendenteId, indice),
      deps,
    ),
  ),
  rota(lerCallbackConfirmarEdicao, (ctx, id, deps) =>
    tratarDecisaoDeEdicao(
      ctx,
      async () => {
        await deps.confirmarEdicao.executar(id);
        return MENSAGEM_EDICAO_APLICADA;
      },
      deps,
    ),
  ),
  rota(lerCallbackCancelarEdicao, (ctx, id, deps) =>
    tratarDecisaoDeEdicao(
      ctx,
      async () => {
        deps.cancelarEdicao.executar(id);
        return MENSAGEM_EDICAO_CANCELADA;
      },
      deps,
    ),
  ),
  rota(lerCallbackPedirRemocao, tratarPedidoDeRemocao),
  rota(lerCallbackConfirmarRemocao, tratarRemocaoConfirmada),
  rota(
    (d) => (lerCallbackManterParcelamento(d) ? true : null),
    (ctx) => tratarManterParcelamento(ctx),
  ),
];

/** Roteia o callback pela primeira rota que o reconhece; qualquer outra coisa é "Ação inválida". */
export async function tratarCallback(
  ctx: CtxCallback,
  deps: DepsTelegram,
): Promise<void> {
  const data = ctx.callbackQuery.data;
  for (const r of ROTAS) {
    const tratar = r(data);
    if (tratar) {
      await tratar(ctx, deps);
      return;
    }
  }
  await ctx.answerCallbackQuery('Ação inválida');
}

export async function tratarNaoSuportado(ctx: {
  reply(texto: Html): Promise<unknown>;
}): Promise<void> {
  await ctx.reply(MENSAGEM_NAO_SUPORTADO);
}
