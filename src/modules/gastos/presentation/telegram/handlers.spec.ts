import { describe, expect, it, vi } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { ProvedorIndisponivelError } from '../../application/errors.js';
import { montarCallbackDesfazer } from './callback.js';
import { MENSAGEM_TEXTO_LONGO, TEXTO_AJUDA } from './formatador.js';
import { MAX_CARACTERES_TEXTO } from '../limites.js';
import { tratarDesfazer, tratarTexto, type DepsTelegram } from './handlers.js';

const REGISTRO = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

function deps(parcial: Partial<DepsTelegram> = {}): DepsTelegram {
  return {
    registrar: {
      executar: vi.fn(async () => ({
        registroId: REGISTRO,
        gastos: [umGasto().comValor(10).build()],
        textoOriginal: 'gastei 10',
      })),
    },
    desfazer: { executar: vi.fn(async () => 1) },
    logger: { error: vi.fn() },
    ...parcial,
  };
}

function ctxTexto(text: string) {
  return { msg: { text }, reply: vi.fn(async () => undefined) };
}

function ctxCallback(data: string | undefined) {
  return {
    callbackQuery: { data, message: { text: '✅ 1 gasto registrado' } },
    answerCallbackQuery: vi.fn(async () => true),
    editMessageText: vi.fn(async () => true),
    editMessageReplyMarkup: vi.fn(async () => true),
  };
}

describe('tratarTexto', () => {
  it('registra e responde com o botão Desfazer', async () => {
    const d = deps();
    const ctx = ctxTexto('gastei 10');

    await tratarTexto(ctx, d);

    expect(d.registrar.executar).toHaveBeenCalledWith({
      tipo: 'texto',
      texto: 'gastei 10',
    });
    const [texto, extra] = ctx.reply.mock.calls[0] as unknown as [
      string,
      {
        reply_markup: {
          inline_keyboard: { text: string; callback_data: string }[][];
        };
      },
    ];
    expect(texto).toContain('✅ 1 gasto registrado');
    expect(extra.reply_markup.inline_keyboard[0]![0]).toEqual({
      text: '↩️ Desfazer',
      callback_data: montarCallbackDesfazer(REGISTRO),
    });
    expect(extra).not.toHaveProperty('parse_mode');
  });

  it('texto acima do limite não chama a IA', async () => {
    const d = deps();
    const ctx = ctxTexto('x'.repeat(MAX_CARACTERES_TEXTO + 1));
    await tratarTexto(ctx, d);
    expect(d.registrar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_TEXTO_LONGO);
  });

  it('texto no limite exato é aceito', async () => {
    const d = deps();
    await tratarTexto(ctxTexto('x'.repeat(MAX_CARACTERES_TEXTO)), d);
    expect(d.registrar.executar).toHaveBeenCalledOnce();
  });

  it('texto só com espaços é ignorado', async () => {
    const d = deps();
    const ctx = ctxTexto('   ');
    await tratarTexto(ctx, d);
    expect(d.registrar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('comando desconhecido responde a ajuda sem chamar a IA', async () => {
    const d = deps();
    const ctx = ctxTexto('/xyz');
    await tratarTexto(ctx, d);
    expect(d.registrar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(TEXTO_AJUDA);
  });

  it('erro conhecido vira mensagem amigável sem log de erro', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new ProvedorIndisponivelError('x');
        }),
      },
    });
    const ctx = ctxTexto('gastei 10');
    await tratarTexto(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      'A IA está indisponível agora. Tente de novo em instantes.',
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('log de erro desconhecido não vaza a message do erro', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new Error('falhou com: meu texto privado');
        }),
      },
    });
    await tratarTexto(ctxTexto('meu texto privado'), d);
    expect(JSON.stringify(vi.mocked(d.logger.error).mock.calls)).not.toContain(
      'meu texto privado',
    );
  });

  it('erro desconhecido é logado sem o texto do usuário', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const ctx = ctxTexto('meu texto privado');
    await tratarTexto(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith('Erro inesperado. Tente de novo.');
    expect(d.logger.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(d.logger.error).mock.calls)).not.toContain(
      'meu texto privado',
    );
  });
});

describe('tratarDesfazer', () => {
  it('desfaz, edita a mensagem e confirma', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
    await tratarDesfazer(ctx, d);
    expect(d.desfazer.executar).toHaveBeenCalledWith(REGISTRO);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      '✅ 1 gasto registrado\n\n↩️ Registro desfeito',
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Desfeito');
  });

  it('nada removido avisa e tira o botão', async () => {
    const d = deps({ desfazer: { executar: vi.fn(async () => 0) } });
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
    await tratarDesfazer(ctx, d);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledOnce();
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      'Nada para desfazer (expirado ou já desfeito)',
    );
  });

  it('callback inválido não chama o caso de uso', async () => {
    const d = deps();
    const ctx = ctxCallback('d:nao-e-uuid');
    await tratarDesfazer(ctx, d);
    expect(d.desfazer.executar).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Ação inválida');
  });

  it('erro no caso de uso ainda responde o callback', async () => {
    const d = deps({
      desfazer: {
        executar: vi.fn(async () => {
          throw new Error('db');
        }),
      },
    });
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
    await tratarDesfazer(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      'Erro inesperado. Tente de novo.',
    );
    expect(d.logger.error).toHaveBeenCalledOnce();
  });

  it('falha ao editar a mensagem ainda responde Desfeito', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
    ctx.editMessageText.mockRejectedValue(new Error('message too old'));
    await tratarDesfazer(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Desfeito');
    expect(ctx.answerCallbackQuery).not.toHaveBeenCalledWith(
      'Erro inesperado. Tente de novo.',
    );
  });

  it('falha ao tirar o botão ainda responde o callback', async () => {
    const d = deps({ desfazer: { executar: vi.fn(async () => 0) } });
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
    ctx.editMessageReplyMarkup.mockRejectedValue(new Error('rede'));
    await tratarDesfazer(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      'Nada para desfazer (expirado ou já desfeito)',
    );
  });
});
