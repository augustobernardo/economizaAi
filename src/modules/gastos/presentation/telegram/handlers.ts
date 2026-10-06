import { InlineKeyboard } from 'grammy';
import type { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import type { RegistrarGastosUseCase } from '../../application/use-cases/registrar-gastos.use-case.js';
import { MAX_CARACTERES_TEXTO } from '../limites.js';
import { lerCallbackDesfazer, montarCallbackDesfazer } from './callback.js';
import {
  formatarRegistro,
  MENSAGEM_NAO_SUPORTADO,
  MENSAGEM_TEXTO_LONGO,
  mensagemDeErro,
  TEXTO_AJUDA,
} from './formatador.js';

export interface DepsTelegram {
  registrar: Pick<RegistrarGastosUseCase, 'executar'>;
  desfazer: Pick<DesfazerRegistroUseCase, 'executar'>;
  logger: { error(mensagem: string): void };
}

export interface CtxTexto {
  msg: { text: string };
  reply(
    texto: string,
    extra?: { reply_markup?: InlineKeyboard },
  ): Promise<unknown>;
}

export interface CtxCallback {
  callbackQuery: { data?: string; message?: { text?: string } };
  answerCallbackQuery(texto?: string): Promise<unknown>;
  editMessageText(texto: string): Promise<unknown>;
  editMessageReplyMarkup(): Promise<unknown>;
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
  if (texto.length > MAX_CARACTERES_TEXTO) {
    await ctx.reply(MENSAGEM_TEXTO_LONGO);
    return;
  }
  try {
    const { registroId, gastos } = await deps.registrar.executar({
      tipo: 'texto',
      texto,
    });
    await ctx.reply(formatarRegistro(gastos), {
      reply_markup: new InlineKeyboard().text(
        '↩️ Desfazer',
        montarCallbackDesfazer(registroId),
      ),
    });
  } catch (erro) {
    logarSeInesperado(erro, deps, 'tratarTexto');
    await ctx.reply(mensagemDeErro(erro));
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

export async function tratarNaoSuportado(ctx: {
  reply(texto: string): Promise<unknown>;
}): Promise<void> {
  await ctx.reply(MENSAGEM_NAO_SUPORTADO);
}
