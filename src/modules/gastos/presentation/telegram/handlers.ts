import { InlineKeyboard, InputFile } from 'grammy';
import { NenhumGastoEncontradoError } from '../../application/errors.js';
import type { ArquivoExportado } from '../../application/ports/exportador.js';
import type { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import type { ExportarGastosUseCase } from '../../application/use-cases/exportar-gastos.use-case.js';
import type { ListarUltimosGastosUseCase } from '../../application/use-cases/listar-ultimos-gastos.use-case.js';
import type {
  ProcessarMensagemUseCase,
  ResultadoProcessamento,
} from '../../application/use-cases/processar-mensagem.use-case.js';
import type { ResumirGastosUseCase } from '../../application/use-cases/resumir-gastos.use-case.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import {
  lerCallbackDesfazer,
  lerCallbackExportar,
  montarCallbackDesfazer,
  montarCallbackExportar,
  PREFIXO_DESFAZER,
} from './callback.js';
import { DownloadFalhouError } from './download.js';
import {
  comTranscricao,
  formatarRegistro,
  formatarResumo,
  formatarSemGastoNoAudio,
  formatarUltimos,
  legendaExportacao,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_NAO_SUPORTADO,
  MENSAGEM_TEXTO_LONGO,
  mensagemDeErro,
  TEXTO_AJUDA,
} from './formatador.js';

export interface DepsTelegram {
  processar: Pick<ProcessarMensagemUseCase, 'executar'>;
  exportar: Pick<ExportarGastosUseCase, 'executar'>;
  resumir: Pick<ResumirGastosUseCase, 'executar'>;
  listarUltimos: Pick<ListarUltimosGastosUseCase, 'executar'>;
  desfazer: Pick<DesfazerRegistroUseCase, 'executar'>;
  logger: { error(mensagem: string): void };
  baixarArquivo(filePath: string): Promise<Buffer>;
}

/** O que os handlers usam para responder; texto puro, sem parse_mode. */
export interface CtxResposta {
  reply(
    texto: string,
    extra?: { reply_markup?: InlineKeyboard },
  ): Promise<unknown>;
  replyWithDocument(
    doc: InputFile,
    extra?: { caption?: string },
  ): Promise<unknown>;
}

export interface CtxTexto extends CtxResposta {
  msg: { text: string };
}

export interface CtxVoz extends CtxResposta {
  msg: { voice: { duration: number; file_size?: number } };
  getFile(): Promise<{ file_path?: string }>;
}

export interface CtxComando extends CtxResposta {
  match: string;
}

export interface CtxCallback extends CtxResposta {
  callbackQuery: { data?: string; message?: { text?: string } };
  answerCallbackQuery(texto?: string): Promise<unknown>;
  editMessageText(texto: string): Promise<unknown>;
  editMessageReplyMarkup(): Promise<unknown>;
}

function tecladoDesfazer(registroId: string): InlineKeyboard {
  return new InlineKeyboard().text(
    '↩️ Desfazer',
    montarCallbackDesfazer(registroId),
  );
}

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
  legenda: string,
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
  transcricao?: string,
): Promise<void> {
  const comVoz = (texto: string) =>
    transcricao === undefined ? texto : comTranscricao(transcricao, texto);
  switch (resultado.tipo) {
    case 'registro':
      await ctx.reply(comVoz(formatarRegistro(resultado.gastos)), {
        reply_markup: tecladoDesfazer(resultado.registroId),
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
      await ctx.reply(comVoz(formatarUltimos(resultado.gastos)));
      return;
  }
}

/** Texto já sem espaços nas pontas: aplica o limite, processa e responde. */
async function processarTexto(
  ctx: CtxResposta,
  texto: string,
  deps: DepsTelegram,
  onde: string,
): Promise<void> {
  if (texto.length > MAX_CARACTERES_TEXTO) {
    await ctx.reply(MENSAGEM_TEXTO_LONGO);
    return;
  }
  try {
    await responder(
      ctx,
      await deps.processar.executar({ tipo: 'texto', texto }),
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
    await ctx.reply(TEXTO_AJUDA);
    return;
  }
  await processarTexto(ctx, texto, deps, 'tratarTexto');
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
    const audio = await baixarVoz(ctx, deps);
    const resultado = await deps.processar.executar({
      tipo: 'audio',
      audio,
      mimeType: 'audio/ogg',
    });
    await responder(ctx, resultado, resultado.textoOriginal);
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
    await ctx.reply('Qual mês você quer exportar?', {
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

export async function tratarComandoResumo(
  ctx: CtxComando,
  deps: DepsTelegram,
): Promise<void> {
  const argumento = ctx.match.trim();
  if (argumento !== '') {
    await processarTexto(
      ctx,
      `resumo ${argumento}`,
      deps,
      'tratarComandoResumo',
    );
    return;
  }
  try {
    const { periodo, resumo } = await deps.resumir.executar({
      mesRelativo: 0,
    });
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
    await ctx.reply(formatarUltimos(await deps.listarUltimos.executar()));
  } catch (erro) {
    await responderErro(ctx, erro, deps, 'tratarComandoUltimos');
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
    await ctx.answerCallbackQuery(mensagemDeErro(erro));
    return;
  }
  // O registro já foi decidido: falha ao editar a mensagem não pode virar "erro".
  try {
    if (removidos > 0) {
      const original = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(`${original}\n\n↩️ Registro desfeito`.trim());
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
  // Responde antes de gerar: tira o spinner do botão.
  await ctx.answerCallbackQuery('Gerando arquivos…');
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
    const mensagem = mensagemDeErro(erro);
    // O callback já foi respondido: o Telegram costuma recusar a segunda resposta.
    await ctx.answerCallbackQuery(mensagem).catch(() => undefined);
    await ctx.reply(mensagem);
  }
}

/** Roteia o callback pelo prefixo; qualquer outra coisa é "Ação inválida". */
export async function tratarCallback(
  ctx: CtxCallback,
  deps: DepsTelegram,
): Promise<void> {
  const data = ctx.callbackQuery.data;
  if (data?.startsWith(PREFIXO_DESFAZER)) {
    await tratarDesfazer(ctx, deps);
    return;
  }
  const mesRelativo = lerCallbackExportar(data);
  if (mesRelativo === null) {
    await ctx.answerCallbackQuery('Ação inválida');
    return;
  }
  await tratarExportarDoBotao(ctx, mesRelativo, deps);
}

export async function tratarNaoSuportado(ctx: {
  reply(texto: string): Promise<unknown>;
}): Promise<void> {
  await ctx.reply(MENSAGEM_NAO_SUPORTADO);
}
