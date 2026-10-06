import { describe, expect, it, vi } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
} from '../../application/errors.js';
import { DownloadFalhouError } from './download.js';
import { montarCallbackDesfazer } from './callback.js';
import {
  formatarSemGastoNoAudio,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_TEXTO_LONGO,
  mensagemDeErro,
  TEXTO_AJUDA,
} from './formatador.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import {
  tratarDesfazer,
  tratarTexto,
  tratarVoz,
  type DepsTelegram,
} from './handlers.js';

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
    baixarArquivo: vi.fn(async () => Buffer.from('ogg')),
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

function ctxVoz(
  voice: { duration: number; file_size?: number },
  filePath: string | null = 'voice/f.oga',
) {
  return {
    msg: { voice },
    getFile: vi.fn(async () => ({ file_path: filePath ?? undefined })),
    reply: vi.fn(async () => undefined),
  };
}

const MSG_DOWNLOAD = 'Não consegui baixar o áudio. Tente de novo.';

describe('tratarVoz', () => {
  it('baixa, registra como áudio e responde com transcrição e Desfazer', async () => {
    const d = deps();
    const ctx = ctxVoz({ duration: 5, file_size: 1000 });

    await tratarVoz(ctx, d);

    expect(d.baixarArquivo).toHaveBeenCalledWith('voice/f.oga');
    expect(d.registrar.executar).toHaveBeenCalledWith({
      tipo: 'audio',
      audio: Buffer.from('ogg'),
      mimeType: 'audio/ogg',
    });
    const [texto, extra] = ctx.reply.mock.calls[0] as unknown as [
      string,
      { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
    ];
    expect(texto.startsWith('🎙️ "gastei 10"')).toBe(true);
    expect(extra.reply_markup.inline_keyboard[0]![0]!.callback_data).toBe(
      montarCallbackDesfazer(REGISTRO),
    );
  });

  it('duração acima do limite não baixa', async () => {
    const d = deps();
    const ctx = ctxVoz({ duration: MAX_DURACAO_AUDIO_S + 1 });
    await tratarVoz(ctx, d);
    expect(ctx.getFile).not.toHaveBeenCalled();
    expect(d.baixarArquivo).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_AUDIO_LONGO);
  });

  it('tamanho acima do limite não baixa', async () => {
    const d = deps();
    const ctx = ctxVoz({ duration: 5, file_size: MAX_BYTES_AUDIO + 1 });
    await tratarVoz(ctx, d);
    expect(ctx.getFile).not.toHaveBeenCalled();
    expect(d.baixarArquivo).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_AUDIO_GRANDE);
  });

  it('exatamente no limite é aceito', async () => {
    const d = deps();
    await tratarVoz(
      ctxVoz({ duration: MAX_DURACAO_AUDIO_S, file_size: MAX_BYTES_AUDIO }),
      d,
    );
    expect(d.baixarArquivo).toHaveBeenCalledOnce();
  });

  it('sem gasto mostra o que foi ouvido', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new NenhumGastoEncontradoError('x', 'bom dia');
        }),
      },
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(formatarSemGastoNoAudio('bom dia'));
  });

  it('sem gasto e sem fala → mensagem padrão', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new NenhumGastoEncontradoError('x', '');
        }),
      },
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoEncontradoError('x')),
    );
  });

  it('transcrição só com espaços → mensagem padrão', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new NenhumGastoEncontradoError('x', '  ');
        }),
      },
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoEncontradoError('x')),
    );
  });

  it('erro inesperado é logado só com o nome', async () => {
    const d = deps({
      registrar: {
        executar: vi.fn(async () => {
          throw new Error('texto privado');
        }),
      },
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith('Erro inesperado. Tente de novo.');
    expect(d.logger.error).toHaveBeenCalledOnce();
    const [msg] = vi.mocked(d.logger.error).mock.calls[0]!;
    expect(msg).toContain('tratarVoz');
    expect(msg).toContain('Error');
    expect(JSON.stringify(vi.mocked(d.logger.error).mock.calls)).not.toContain(
      'texto privado',
    );
  });

  it('download falho → mensagem própria, sem chamar a IA', async () => {
    const d = deps({
      baixarArquivo: vi.fn(async () => {
        throw new DownloadFalhouError();
      }),
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(d.registrar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MSG_DOWNLOAD);
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('getFile sem file_path → mensagem de download', async () => {
    const d = deps();
    const ctx = ctxVoz({ duration: 3 }, null);
    await tratarVoz(ctx, d);
    expect(d.baixarArquivo).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MSG_DOWNLOAD);
  });

  it('getFile rejeitando → mensagem de download', async () => {
    const d = deps();
    const ctx = {
      ...ctxVoz({ duration: 3 }),
      getFile: vi.fn(async () => {
        throw new Error('400');
      }),
    };
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(MSG_DOWNLOAD);
  });
});
