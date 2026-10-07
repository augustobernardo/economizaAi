import { InputFile } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  ProvedorIndisponivelError,
} from '../../application/errors.js';
import type { ResultadoProcessamento } from '../../application/use-cases/processar-mensagem.use-case.js';
import { DataInvalidaError } from '../../domain/errors.js';
import { Periodo } from '../../domain/periodo.js';
import { resumir } from '../../domain/resumo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { DownloadFalhouError } from './download.js';
import { montarCallbackDesfazer } from './callback.js';
import {
  comTranscricao,
  formatarResumo,
  formatarSemGastoNoAudio,
  formatarUltimos,
  legendaExportacao,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_COMANDO_DESCONHECIDO,
  MENSAGEM_ESCOLHER_MES_EXPORTAR,
  MENSAGEM_FALHA_AO_DESFAZER,
  MENSAGEM_TEXTO_LONGO,
  mensagemDeErro,
} from './formatador.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import {
  tratarCallback,
  tratarComandoExportar,
  tratarComandoResumo,
  tratarComandoUltimos,
  tratarDesfazer,
  tratarTexto,
  tratarVoz,
  type DepsTelegram,
} from './handlers.js';

const HOJE = '2026-10-05';
const REGISTRO = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
const AGOSTO = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
const GASTOS = [
  umGasto().comValor(10).build(),
  umGasto().comValor(20).comDescricao('Uber').build(),
];
const ARQUIVOS = [
  {
    nomeArquivo: 'economizaai-2026-08.csv',
    conteudo: Buffer.from('csv'),
    mimeType: 'text/csv; charset=utf-8',
    formato: 'csv' as const,
  },
  {
    nomeArquivo: 'economizaai-2026-08.md',
    conteudo: Buffer.from('md'),
    mimeType: 'text/markdown; charset=utf-8',
    formato: 'md' as const,
  },
];

function processando(resultado: ResultadoProcessamento) {
  return { executar: vi.fn(async () => resultado) };
}

function falhando(erro: Error) {
  return {
    executar: vi.fn(async (): Promise<never> => {
      throw erro;
    }),
  };
}

function deps(parcial: Partial<DepsTelegram> = {}): DepsTelegram {
  return {
    processar: processando({
      tipo: 'registro',
      registroId: REGISTRO,
      gastos: [umGasto().comValor(10).build()],
      textoOriginal: 'gastei 10',
    }),
    exportar: {
      executar: vi.fn(async () => ({
        periodo: AGOSTO,
        quantidade: 2,
        arquivos: ARQUIVOS,
      })),
    },
    resumir: {
      executar: vi.fn(async () => ({
        periodo: AGOSTO,
        resumo: resumir(GASTOS),
      })),
    },
    listarUltimos: { executar: vi.fn(async () => GASTOS) },
    desfazer: { executar: vi.fn(async () => 1) },
    logger: { error: vi.fn() },
    relogio: new RelogioFixo(new Date('2026-10-05T15:00:00Z')),
    baixarArquivo: vi.fn(async () => Buffer.from('ogg')),
    ...parcial,
  };
}

function respostas() {
  return {
    reply: vi.fn(async (_texto: string, _extra?: unknown) => undefined),
    replyWithDocument: vi.fn(
      async (_doc: InputFile, _extra?: { caption?: string }) => undefined,
    ),
  };
}

function ctxTexto(text: string) {
  return { msg: { text }, ...respostas() };
}

function ctxComando(match: string) {
  return { match, ...respostas() };
}

function ctxCallback(data: string | undefined, texto = '✅ Gasto registrado!') {
  return {
    callbackQuery: { data, message: { text: texto } },
    answerCallbackQuery: vi.fn(async (_texto?: string) => true),
    editMessageText: vi.fn(async () => true),
    editMessageReplyMarkup: vi.fn(async () => true),
    ...respostas(),
  };
}

type Teclado = {
  reply_markup: {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
};

function documentosEnviados(ctx: ReturnType<typeof respostas>) {
  return ctx.replyWithDocument.mock.calls.map(([doc, extra]) => ({
    nome: doc.filename,
    caption: extra?.caption,
  }));
}

describe('tratarTexto', () => {
  it('registra e responde com o botão Desfazer', async () => {
    const d = deps();
    const ctx = ctxTexto('gastei 10');

    await tratarTexto(ctx, d);

    expect(d.processar.executar).toHaveBeenCalledWith({
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
    expect(texto).toContain('✅ <b>Gasto registrado!</b>');
    expect(extra.reply_markup.inline_keyboard[0]![0]).toEqual({
      text: '↩️ Desfazer',
      callback_data: montarCallbackDesfazer(REGISTRO),
    });
    expect(extra).not.toHaveProperty('parse_mode');
  });

  it('registro usa a data de hoje do relógio (Hoje, dd/mm)', async () => {
    const ctx = ctxTexto('gastei 10');
    const d = deps({
      processar: processando({
        tipo: 'registro',
        registroId: REGISTRO,
        gastos: [
          umGasto().em(new Date('2026-10-05T15:00:00Z')).comData(HOJE).build(),
        ],
        textoOriginal: 'gastei 10',
      }),
    });
    await tratarTexto(ctx, d);
    expect(ctx.reply.mock.calls[0]![0]).toContain('📅 Hoje, 05/10');
  });

  it('texto acima do limite não chama a IA', async () => {
    const d = deps();
    const ctx = ctxTexto('x'.repeat(MAX_CARACTERES_TEXTO + 1));
    await tratarTexto(ctx, d);
    expect(d.processar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_TEXTO_LONGO);
  });

  it('texto no limite exato é aceito', async () => {
    const d = deps();
    await tratarTexto(ctxTexto('x'.repeat(MAX_CARACTERES_TEXTO)), d);
    expect(d.processar.executar).toHaveBeenCalledOnce();
  });

  it('texto só com espaços é ignorado', async () => {
    const d = deps();
    const ctx = ctxTexto('   ');
    await tratarTexto(ctx, d);
    expect(d.processar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('comando desconhecido responde ❓ sem chamar a IA', async () => {
    const d = deps();
    const ctx = ctxTexto('/xyz');
    await tratarTexto(ctx, d);
    expect(d.processar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_COMANDO_DESCONHECIDO);
  });

  it('erro conhecido vira mensagem amigável sem log de erro', async () => {
    const d = deps({
      processar: falhando(new ProvedorIndisponivelError('x')),
    });
    const ctx = ctxTexto('gastei 10');
    await tratarTexto(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new ProvedorIndisponivelError('x')),
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('log de erro desconhecido não vaza a message do erro', async () => {
    const d = deps({
      processar: falhando(new Error('falhou com: meu texto privado')),
    });
    await tratarTexto(ctxTexto('meu texto privado'), d);
    expect(JSON.stringify(vi.mocked(d.logger.error).mock.calls)).not.toContain(
      'meu texto privado',
    );
  });

  it('erro desconhecido é logado sem o texto do usuário', async () => {
    const d = deps({
      processar: falhando(new Error('boom')),
    });
    const ctx = ctxTexto('meu texto privado');
    await tratarTexto(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(mensagemDeErro(new Error('x')));
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
      '✅ Gasto registrado!\n\n↩️ <b>Pronto, desfiz o registro.</b>',
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Desfeito');
  });

  it('Desfazer escapa o texto original antes de editar em HTML', async () => {
    const ctx = ctxCallback(
      montarCallbackDesfazer(REGISTRO),
      '✅ Gasto registrado!\n📝 <b>x</b> & y',
    );
    await tratarDesfazer(
      ctx,
      deps({ desfazer: { executar: vi.fn(async () => 1) } }),
    );
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      '✅ Gasto registrado!\n📝 &lt;b&gt;x&lt;/b&gt; &amp; y\n\n↩️ <b>Pronto, desfiz o registro.</b>',
    );
  });

  // O popup é texto puro: uma constante, nunca derivada de mensagem HTML.
  it.each([new Error('db fora'), new NenhumGastoNoPeriodoError(AGOSTO)])(
    'falha no Desfazer responde o popup fixo em texto puro (%s)',
    async (erro) => {
      const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));
      await tratarDesfazer(ctx, deps({ desfazer: falhando(erro) }));
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        MENSAGEM_FALHA_AO_DESFAZER,
      );
      expect(MENSAGEM_FALHA_AO_DESFAZER).not.toMatch(/[<>&]/);
    },
  );

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
      MENSAGEM_FALHA_AO_DESFAZER,
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
      '🛠️ Algo deu errado do meu lado. Já registrei o problema.',
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
    ...respostas(),
  };
}

const MSG_DOWNLOAD = '🎧 Não consegui baixar o áudio. Tente de novo.';

describe('tratarVoz', () => {
  it('baixa, registra como áudio e responde com transcrição e Desfazer', async () => {
    const d = deps();
    const ctx = ctxVoz({ duration: 5, file_size: 1000 });

    await tratarVoz(ctx, d);

    expect(d.baixarArquivo).toHaveBeenCalledWith('voice/f.oga');
    expect(d.processar.executar).toHaveBeenCalledWith({
      tipo: 'audio',
      audio: Buffer.from('ogg'),
      mimeType: 'audio/ogg',
    });
    const [texto, extra] = ctx.reply.mock.calls[0] as unknown as [
      string,
      { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
    ];
    expect(texto.startsWith('🎙️ Entendi: "gastei 10"')).toBe(true);
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
      processar: falhando(new NenhumGastoEncontradoError('x', 'bom dia')),
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(formatarSemGastoNoAudio('bom dia'));
  });

  it('sem gasto e sem fala → mensagem padrão', async () => {
    const d = deps({
      processar: falhando(new NenhumGastoEncontradoError('x', '')),
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoEncontradoError('x')),
    );
  });

  it('transcrição só com espaços → mensagem padrão', async () => {
    const d = deps({
      processar: falhando(new NenhumGastoEncontradoError('x', '  ')),
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoEncontradoError('x')),
    );
  });

  it('erro inesperado é logado só com o nome', async () => {
    const d = deps({
      processar: falhando(new Error('texto privado')),
    });
    const ctx = ctxVoz({ duration: 3 });
    await tratarVoz(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(mensagemDeErro(new Error('x')));
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
    expect(d.processar.executar).not.toHaveBeenCalled();
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

describe('respostas por tipo de resultado', () => {
  const exportacao: ResultadoProcessamento = {
    tipo: 'exportacao',
    periodo: AGOSTO,
    quantidade: 2,
    arquivos: ARQUIVOS,
    textoOriginal: 'exporta agosto',
  };

  it('texto → exportação envia dois documentos, legenda só no primeiro', async () => {
    const d = deps({ processar: processando(exportacao) });
    const ctx = ctxTexto('exporta agosto');

    await tratarTexto(ctx, d);

    expect(documentosEnviados(ctx)).toEqual([
      {
        nome: 'economizaai-2026-08.csv',
        caption: legendaExportacao(AGOSTO, 2),
      },
      { nome: 'economizaai-2026-08.md', caption: undefined },
    ]);
    expect(ctx.replyWithDocument.mock.calls[0]![0]).toBeInstanceOf(InputFile);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('voz → exportação põe a transcrição na legenda do primeiro documento', async () => {
    const d = deps({ processar: processando(exportacao) });
    const ctx = ctxVoz({ duration: 3 });

    await tratarVoz(ctx, d);

    expect(documentosEnviados(ctx)[0]!.caption).toBe(
      comTranscricao('exporta agosto', legendaExportacao(AGOSTO, 2)),
    );
  });

  it('voz → legenda longa cabe em 1024 caracteres', async () => {
    const d = deps({
      processar: processando({
        ...exportacao,
        textoOriginal: 'a'.repeat(2000),
      }),
    });
    const ctx = ctxVoz({ duration: 3 });

    await tratarVoz(ctx, d);

    const legenda = documentosEnviados(ctx)[0]!.caption!;
    expect(legenda.length).toBeLessThanOrEqual(1024);
  });

  it('voz → resumo responde com a transcrição e o resumo', async () => {
    const resumo = resumir(GASTOS);
    const d = deps({
      processar: processando({
        tipo: 'resumo',
        periodo: AGOSTO,
        resumo,
        textoOriginal: 'quanto gastei em agosto',
      }),
    });
    const ctx = ctxVoz({ duration: 3 });

    await tratarVoz(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(
      comTranscricao('quanto gastei em agosto', formatarResumo(AGOSTO, resumo)),
    );
  });

  it('texto → últimos responde com a lista', async () => {
    const d = deps({
      processar: processando({
        tipo: 'ultimos',
        gastos: GASTOS,
        textoOriginal: 'últimos gastos',
      }),
    });
    const ctx = ctxTexto('últimos gastos');

    await tratarTexto(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(formatarUltimos(GASTOS, HOJE));
  });

  it('nenhum gasto no período → mensagem do mês informado', async () => {
    const d = deps({
      processar: falhando(new NenhumGastoNoPeriodoError(AGOSTO)),
    });
    const ctx = ctxTexto('exporta agosto');

    await tratarTexto(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoNoPeriodoError(AGOSTO)),
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });
});

describe('comandos', () => {
  it('/exportar sem argumento oferece os botões de mês, sem chamar a IA', async () => {
    const d = deps();
    const ctx = ctxComando('  ');

    await tratarComandoExportar(ctx, d);

    expect(d.processar.executar).not.toHaveBeenCalled();
    const [texto, extra] = ctx.reply.mock.calls[0] as unknown as [
      string,
      Teclado,
    ];
    expect(texto).toBe(MENSAGEM_ESCOLHER_MES_EXPORTAR);
    expect(
      extra.reply_markup.inline_keyboard.flat().map((b) => b.callback_data),
    ).toEqual(['e:0', 'e:-1']);
  });

  it('/exportar com argumento vira pedido em linguagem natural', async () => {
    const d = deps();

    await tratarComandoExportar(ctxComando(' setembro '), d);

    expect(d.processar.executar).toHaveBeenCalledWith({
      tipo: 'texto',
      texto: 'exportar setembro',
    });
  });

  it('/exportar com argumento longo demais não chama a IA', async () => {
    const d = deps();
    const ctx = ctxComando('x'.repeat(MAX_CARACTERES_TEXTO));

    await tratarComandoExportar(ctx, d);

    expect(d.processar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_TEXTO_LONGO);
  });

  it('/resumo sem argumento resume o mês atual sem IA', async () => {
    const d = deps();
    const ctx = ctxComando('');

    await tratarComandoResumo(ctx, d);

    expect(d.resumir.executar).toHaveBeenCalledWith({ mesRelativo: 0 });
    expect(d.processar.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      formatarResumo(AGOSTO, resumir(GASTOS)),
    );
  });

  it('/resumo 2026-09 resume sem IA', async () => {
    const d = deps();

    await tratarComandoResumo(ctxComando('2026-09'), d);

    expect(d.resumir.executar).toHaveBeenCalledWith({ mes: '2026-09' });
    expect(d.processar.executar).not.toHaveBeenCalled();
  });

  it('/resumo 2026-13 responde mês inválido sem IA', async () => {
    const d = deps({ resumir: falhando(new DataInvalidaError('x')) });
    const ctx = ctxComando('2026-13');

    await tratarComandoResumo(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new DataInvalidaError('x')),
    );
    expect(d.processar.executar).not.toHaveBeenCalled();
  });

  it('/resumo 2026-1 não casa o formato e vai à IA', async () => {
    const d = deps();

    await tratarComandoResumo(ctxComando('2026-1'), d);

    expect(d.resumir.executar).not.toHaveBeenCalled();
    expect(d.processar.executar).toHaveBeenCalledOnce();
  });

  it('/resumo mês vazio responde com mês/ano', async () => {
    const setembro = Periodo.doMesInformado('2026-09', '2026-10-05');
    const ctx = ctxComando('2026-09');

    await tratarComandoResumo(
      ctx,
      deps({ resumir: falhando(new NenhumGastoNoPeriodoError(setembro)) }),
    );

    expect(ctx.reply).toHaveBeenCalledWith(
      '🗓️ Nenhum gasto registrado em <b>setembro/2026</b>.',
    );
  });

  it('/resumo com argumento vira pedido em linguagem natural', async () => {
    const d = deps();

    await tratarComandoResumo(ctxComando('agosto'), d);

    expect(d.processar.executar).toHaveBeenCalledWith({
      tipo: 'texto',
      texto: 'resumo agosto',
    });
  });

  it('/resumo sem gastos no mês responde a mensagem do período', async () => {
    const d = deps({
      resumir: falhando(new NenhumGastoNoPeriodoError(AGOSTO)),
    });
    const ctx = ctxComando('');

    await tratarComandoResumo(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new NenhumGastoNoPeriodoError(AGOSTO)),
    );
  });

  it('/ultimos lista os últimos gastos sem IA', async () => {
    const d = deps();
    const ctx = respostas();

    await tratarComandoUltimos(ctx, d);

    expect(d.listarUltimos.executar).toHaveBeenCalledWith();
    expect(ctx.reply).toHaveBeenCalledWith(formatarUltimos(GASTOS, HOJE));
  });
});

describe('tratarCallback', () => {
  it('e:-1 exporta o mês anterior e envia os dois documentos', async () => {
    const d = deps();
    const ctx = ctxCallback('e:-1');

    await tratarCallback(ctx, d);

    expect(d.exportar.executar).toHaveBeenCalledWith({ mesRelativo: -1 });
    expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(ctx.answerCallbackQuery.mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(d.exportar.executar).mock.invocationCallOrder[0]!,
    );
    expect(documentosEnviados(ctx)).toEqual([
      {
        nome: 'economizaai-2026-08.csv',
        caption: legendaExportacao(AGOSTO, 2),
      },
      { nome: 'economizaai-2026-08.md', caption: undefined },
    ]);
  });

  it('e:5 é ação inválida e não exporta', async () => {
    const d = deps();
    const ctx = ctxCallback('e:5');

    await tratarCallback(ctx, d);

    expect(d.exportar.executar).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Ação inválida');
  });

  it('prefixo desconhecido é ação inválida', async () => {
    const d = deps();
    const ctx = ctxCallback('x:1');

    await tratarCallback(ctx, d);

    expect(d.exportar.executar).not.toHaveBeenCalled();
    expect(d.desfazer.executar).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Ação inválida');
  });

  it('d:<uuid> continua desfazendo', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackDesfazer(REGISTRO));

    await tratarCallback(ctx, d);

    expect(d.desfazer.executar).toHaveBeenCalledWith(REGISTRO);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Desfeito');
  });

  it('erro na exportação avisa no chat sem responder o callback de novo', async () => {
    const d = deps({
      exportar: falhando(new NenhumGastoNoPeriodoError(AGOSTO)),
    });
    const ctx = ctxCallback('e:0');
    const mensagem = mensagemDeErro(new NenhumGastoNoPeriodoError(AGOSTO));

    await tratarCallback(ctx, d);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Gerando arquivos…');
    expect(ctx.reply).toHaveBeenCalledWith(mensagem);
    expect(ctx.replyWithDocument).not.toHaveBeenCalled();
  });

  it('primeira resposta ao callback rejeitando não impede a exportação', async () => {
    const d = deps();
    const ctx = ctxCallback('e:0');
    ctx.answerCallbackQuery.mockRejectedValueOnce(
      new Error('query is too old'),
    );

    await tratarCallback(ctx, d);

    expect(d.exportar.executar).toHaveBeenCalledWith({ mesRelativo: 0 });
    expect(documentosEnviados(ctx)).toHaveLength(2);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
