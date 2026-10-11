import { InputFile } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { dadosComGastos } from '../../../../../test/builders/dados-do-periodo.builder.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import * as erros from '../../application/errors.js';
import {
  CartaoEmUsoError,
  PendenciaExpiradaError,
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  ProvedorIndisponivelError,
} from '../../application/errors.js';
import type { ResultadoProcessamento } from '../../application/use-cases/processar-mensagem.use-case.js';
import { Cartao } from '../../domain/cartao.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { PropostaDeEdicao } from '../../application/use-cases/edicao.use-cases.js';
import type { ResultadoRegistro } from '../../application/use-cases/registrar-lancamentos.use-case.js';
import { comporFatura, FaturaInformada } from '../../domain/fatura.js';
import { DataInvalidaError, ValorInvalidoError } from '../../domain/errors.js';
import { Periodo } from '../../domain/periodo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { DownloadFalhouError } from './download.js';
import {
  CALLBACK_MANTER_PARCELAMENTO,
  montarCallbackCancelarEdicao,
  montarCallbackCartao,
  montarCallbackConfirmarEdicao,
  montarCallbackConfirmarRemocao,
  montarCallbackDesfazer,
  montarCallbackForma,
  montarCallbackPedirRemocao,
} from './callback.js';
import {
  comDesfecho,
  comTranscricao,
  formatarCartaoCadastrado,
  formatarCartaoRemovido,
  formatarCartoes,
  formatarEdicao,
  formatarEscolha,
  formatarFaturas,
  formatarParcelamentos,
  formatarPedidoDeRemocao,
  MENSAGEM_EDICAO_APLICADA,
  MENSAGEM_EDICAO_CANCELADA,
  MENSAGEM_PARCELAMENTO_MANTIDO,
  MENSAGEM_PARCELAMENTO_REMOVIDO,
  MENSAGEM_USO_CARTOES,
  MENSAGEM_USO_FATURA,
  formatarFatura,
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
  POPUP_OPCAO_INVALIDA,
  POPUP_PARCELAMENTO_INEXISTENTE,
  POPUP_PENDENCIA_EXPIRADA,
} from './formatador.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import {
  tratarCallback,
  tratarComandoCartoes,
  tratarComandoExportar,
  tratarComandoFatura,
  tratarComandoParcelamentos,
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

const AGORA = new Date('2026-10-05T15:00:00Z');
const PENDENTE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const INTER = Cartao.criar({
  nome: 'Inter',
  diaFechamento: 3,
  diaVencimento: 10,
  agora: AGORA,
});
const COMPOSICAO = comporFatura({
  cartaoId: INTER.id,
  mes: '2026-11',
  vencimento: '2026-11-10',
  inicialCentavos: 0,
  comprasCredito: [],
  parcelas: [],
  reembolsos: [],
});
const GASTO_REGISTRADO = umGasto().em(AGORA).comValor(10).build();
const REGISTRADO: ResultadoRegistro = {
  tipo: 'registrado',
  registroId: REGISTRO,
  gastos: [GASTO_REGISTRADO],
  entradas: [],
  parcelamentos: [],
  cartoes: new Map(),
  avisos: [],
  textoOriginal: 'gastei 10',
};
const UBER = umGasto().em(AGORA).comValor(30).comDescricao('Uber').build();
const PROPOSTA: PropostaDeEdicao = {
  registroId: REGISTRO,
  antes: [UBER],
  depois: [UBER.editar({ valor: Dinheiro.deReais(35) }, AGORA)],
  removidos: [],
  acrescentados: [],
  cartoes: new Map(),
};
const PARCELAMENTO = umParcelamento()
  .noCartao(INTER.id)
  .comDescricao('Monitor')
  .build();
const ITEM_PARCELAMENTO = {
  parcelamento: PARCELAMENTO,
  cartao: INTER,
  atual: PARCELAMENTO.parcelaNoMes('2026-10'),
  restantes: 9,
};

function processando(resultado: ResultadoProcessamento) {
  return { executar: vi.fn(async () => resultado) };
}

const SEM_OUTROS = {
  entradas: [],
  parcelamentos: [],
  cartoes: new Map(),
  avisos: [],
};

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
      ...SEM_OUTROS,
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
        resumo: dadosComGastos(GASTOS, AGOSTO).resumo,
        cartoes: new Map(),
      })),
    },
    listarUltimos: { executar: vi.fn(async () => GASTOS) },
    desfazer: { executar: vi.fn(async () => 1) },
    concluirRegistro: {
      executar: vi.fn(async () => REGISTRADO),
      executarPorIndice: vi.fn(async () => REGISTRADO),
    },
    prepararEdicao: {
      executar: vi.fn(async () => ({
        pendenteId: PENDENTE,
        proposta: PROPOSTA,
      })),
    },
    confirmarEdicao: { executar: vi.fn(async () => PROPOSTA) },
    cancelarEdicao: { executar: vi.fn() },
    cadastrarCartao: { executar: vi.fn(async () => INTER) },
    listarCartoes: { executar: vi.fn(async () => [INTER]) },
    removerCartao: { executar: vi.fn(async () => INTER) },
    consultarFatura: {
      executar: vi.fn(async () => [{ cartao: INTER, composicao: COMPOSICAO }]),
    },
    informarFatura: {
      executar: vi.fn(async () => ({
        cartao: INTER,
        fatura: FaturaInformada.criar({
          cartaoId: INTER.id,
          mes: '2026-11',
          valorInicialCentavos: 40_000,
          agora: AGORA,
        }),
        anterior: null,
        composicao: COMPOSICAO,
      })),
    },
    listarParcelamentos: { executar: vi.fn(async () => [ITEM_PARCELAMENTO]) },
    removerParcelamento: { executar: vi.fn(async () => true) },
    logger: { error: vi.fn() },
    relogio: new RelogioFixo(new Date('2026-10-05T15:00:00Z')),
    baixarArquivo: vi.fn(async () => Buffer.from('ogg')),
    ...parcial,
  };
}

const BOT_ID = 777;

function respostas() {
  return {
    me: { id: BOT_ID },
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
        ...SEM_OUTROS,
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
    const resumo = dadosComGastos(GASTOS, AGOSTO).resumo;
    const d = deps({
      processar: processando({
        tipo: 'resumo',
        periodo: AGOSTO,
        resumo,
        cartoes: new Map(),
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

  it('texto → faturas responde uma linha por cartão', async () => {
    const cartao = Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: new Date('2026-10-05T15:00:00Z'),
    });
    const composicao = comporFatura({
      cartaoId: cartao.id,
      mes: '2026-10',
      vencimento: '2026-10-10',
      inicialCentavos: 12_345,
      comprasCredito: [],
      parcelas: [],
      reembolsos: [],
    });
    const d = deps({
      processar: processando({
        tipo: 'faturas',
        itens: [{ cartao, composicao }],
        textoOriginal: 'fatura do inter',
      }),
    });
    const ctx = ctxTexto('fatura do inter');

    await tratarTexto(ctx, d);

    expect(ctx.reply).toHaveBeenCalledWith(formatarFatura(cartao, composicao));
    expect(formatarFatura(cartao, composicao)).toContain('R$ 123,45');
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
      formatarResumo(AGOSTO, dadosComGastos(GASTOS, AGOSTO).resumo),
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

function tecladoDe(extra: unknown) {
  return (extra as Teclado).reply_markup.inline_keyboard.flat();
}

function respondendoA(callbackData: string | null, remetente = BOT_ID) {
  return {
    from: { id: remetente },
    reply_markup:
      callbackData === null
        ? undefined
        : {
            inline_keyboard: [[{ text: 'botão', callback_data: callbackData }]],
          },
  };
}

const ESCOLHA_DE_CARTAO: ResultadoProcessamento = {
  tipo: 'escolha',
  pendenteId: PENDENTE,
  escolha: { tipo: 'cartao', alvo: 'gasto', indice: 0 },
  opcoes: [
    { rotulo: 'Inter', valor: INTER.id },
    { rotulo: 'Nubank', valor: 'outro-id' },
  ],
  textoOriginal: 'gastei 10 no crédito',
};

describe('escolha por botões', () => {
  it('escolha de cartão responde a pergunta com um botão por opção (índice)', async () => {
    const d = deps({ processar: processando(ESCOLHA_DE_CARTAO) });
    const ctx = ctxTexto('gastei 10 no crédito');
    await tratarTexto(ctx, d);
    const [texto, extra] = ctx.reply.mock.calls[0]!;
    expect(texto).toBe(formatarEscolha(ESCOLHA_DE_CARTAO.escolha));
    expect(tecladoDe(extra)).toEqual([
      { text: 'Inter', callback_data: montarCallbackCartao(PENDENTE, 0) },
      { text: 'Nubank', callback_data: montarCallbackCartao(PENDENTE, 1) },
    ]);
  });

  it('escolha de forma usa f:<id>:c|d', async () => {
    const d = deps({
      processar: processando({
        ...ESCOLHA_DE_CARTAO,
        escolha: { tipo: 'forma', indiceGasto: 0 },
        opcoes: [
          { rotulo: '💳 Crédito', valor: 'credito' },
          { rotulo: '🏦 Débito', valor: 'debito' },
        ],
      } as ResultadoProcessamento),
    });
    const ctx = ctxTexto('gastei 10 no Inter');
    await tratarTexto(ctx, d);
    expect(
      tecladoDe(ctx.reply.mock.calls[0]![1]).map((b) => b.callback_data),
    ).toEqual([
      montarCallbackForma(PENDENTE, 'credito'),
      montarCallbackForma(PENDENTE, 'debito'),
    ]);
  });

  it('callback k: conclui pelo índice e edita a pergunta para o registro com Desfazer', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackCartao(PENDENTE, 1));
    await tratarCallback(ctx, d);
    expect(d.concluirRegistro.executarPorIndice).toHaveBeenCalledWith(
      PENDENTE,
      1,
    );
    const [texto, extra] = ctx.editMessageText.mock.calls[0]! as unknown as [
      string,
      unknown,
    ];
    expect(texto).toContain('✅ <b>Gasto registrado!</b>');
    expect(tecladoDe(extra)[0]!.callback_data).toBe(
      montarCallbackDesfazer(REGISTRO),
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it('callback f: conclui com a forma; nova escolha edita para a nova pergunta', async () => {
    const d = deps({
      concluirRegistro: {
        executar: vi.fn(async () => ESCOLHA_DE_CARTAO as ResultadoRegistro),
        executarPorIndice: vi.fn(),
      },
    });
    const ctx = ctxCallback(montarCallbackForma(PENDENTE, 'debito'));
    await tratarCallback(ctx, d);
    expect(d.concluirRegistro.executar).toHaveBeenCalledWith(
      PENDENTE,
      'debito',
    );
    const [texto, extra] = ctx.editMessageText.mock.calls[0]! as unknown as [
      string,
      unknown,
    ];
    expect(texto).toBe('💳 Em qual cartão?');
    expect(tecladoDe(extra)).toHaveLength(2);
  });

  it('pendência expirada responde o callback e avisa, sem log de erro', async () => {
    const d = deps({
      concluirRegistro: {
        executar: vi.fn(),
        executarPorIndice: vi.fn(async () => {
          throw new PendenciaExpiradaError('x');
        }),
      },
    });
    const ctx = ctxCallback(montarCallbackCartao(PENDENTE, 0));
    await tratarCallback(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      POPUP_PENDENCIA_EXPIRADA,
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('duplo clique: o 2º (expirado) não apaga o registro do 1º', async () => {
    const d = deps({
      concluirRegistro: {
        executar: vi.fn(),
        executarPorIndice: vi
          .fn()
          .mockResolvedValueOnce(REGISTRADO)
          .mockRejectedValueOnce(new PendenciaExpiradaError('x')),
      },
    });
    const ctx = ctxCallback(montarCallbackCartao(PENDENTE, 0));
    await tratarCallback(ctx, d);
    await tratarCallback(ctx, d);
    expect(ctx.editMessageText).toHaveBeenCalledOnce();
    expect(
      (ctx.editMessageText.mock.lastCall as unknown as [string])[0],
    ).toContain('Gasto registrado!');
    expect(ctx.answerCallbackQuery).toHaveBeenLastCalledWith(
      POPUP_PENDENCIA_EXPIRADA,
    );
  });

  it('opção inválida só avisa no popup e mantém a pergunta', async () => {
    const d = deps({
      concluirRegistro: {
        executar: vi.fn(),
        executarPorIndice: vi.fn(async () => {
          throw new erros.EscolhaInvalidaError('x');
        }),
      },
    });
    const ctx = ctxCallback(montarCallbackCartao(PENDENTE, 5));
    await tratarCallback(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(POPUP_OPCAO_INVALIDA);
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(ctx.editMessageReplyMarkup).not.toHaveBeenCalled();
  });

  it('falha ao editar ainda entrega o registro numa mensagem nova', async () => {
    const ctx = ctxCallback(montarCallbackCartao(PENDENTE, 0));
    ctx.editMessageText.mockRejectedValue(new Error('message too old'));
    await tratarCallback(ctx, deps());
    expect(ctx.reply.mock.calls[0]![0]).toContain('Gasto registrado!');
  });

  it.each([`k:${PENDENTE}:x`, `f:${PENDENTE}:z`, 'k:nao-e-uuid:1'])(
    '%s é ação inválida',
    async (data) => {
      const d = deps();
      const ctx = ctxCallback(data);
      await tratarCallback(ctx, d);
      expect(d.concluirRegistro.executar).not.toHaveBeenCalled();
      expect(d.concluirRegistro.executarPorIndice).not.toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('Ação inválida');
    },
  );
});

describe('correção por resposta a um registro', () => {
  function ctxRespostaTexto(text: string, callbackData: string | null) {
    return {
      msg: { text, reply_to_message: respondendoA(callbackData) },
      ...respostas(),
    };
  }

  it('reply a registro com Desfazer → proposta com Confirmar e Cancelar', async () => {
    const d = deps();
    const ctx = ctxRespostaTexto('era 35', montarCallbackDesfazer(REGISTRO));
    await tratarTexto(ctx, d);
    expect(d.prepararEdicao.executar).toHaveBeenCalledWith(REGISTRO, {
      tipo: 'texto',
      texto: 'era 35',
    });
    expect(d.processar.executar).not.toHaveBeenCalled();
    const [texto, extra] = ctx.reply.mock.calls[0]!;
    expect(texto).toBe(formatarEdicao(PROPOSTA, HOJE));
    expect(tecladoDe(extra).map((b) => b.callback_data)).toEqual([
      montarCallbackConfirmarEdicao(PENDENTE),
      montarCallbackCancelarEdicao(PENDENTE),
    ]);
  });

  it('reply a mensagem de outro remetente com botão d: segue o fluxo normal', async () => {
    const d = deps();
    const ctx = {
      msg: {
        text: 'gastei 10',
        reply_to_message: respondendoA(montarCallbackDesfazer(REGISTRO), 123),
      },
      ...respostas(),
    };
    await tratarTexto(ctx, d);
    expect(d.prepararEdicao.executar).not.toHaveBeenCalled();
    expect(d.processar.executar).toHaveBeenCalledOnce();
  });

  it('voz em reply a outro remetente segue o fluxo normal', async () => {
    const d = deps();
    const ctx = {
      ...ctxVoz({ duration: 5, file_size: 1000 }),
      msg: {
        voice: { duration: 5, file_size: 1000 },
        reply_to_message: respondendoA(montarCallbackDesfazer(REGISTRO), 123),
      },
    };
    await tratarVoz(ctx, d);
    expect(d.prepararEdicao.executar).not.toHaveBeenCalled();
    expect(d.processar.executar).toHaveBeenCalledOnce();
  });

  it('reply a mensagem sem botão d: segue o fluxo normal', async () => {
    for (const data of [null, 'e:0', 'd:nao-e-uuid']) {
      const d = deps();
      await tratarTexto(ctxRespostaTexto('gastei 10', data), d);
      expect(d.prepararEdicao.executar).not.toHaveBeenCalled();
      expect(d.processar.executar).toHaveBeenCalledOnce();
    }
  });

  it('correção longa demais não chama a IA', async () => {
    const d = deps();
    const ctx = ctxRespostaTexto(
      'x'.repeat(MAX_CARACTERES_TEXTO + 1),
      montarCallbackDesfazer(REGISTRO),
    );
    await tratarTexto(ctx, d);
    expect(d.prepararEdicao.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_TEXTO_LONGO);
  });

  it('voz em resposta a registro corrige com transcrição', async () => {
    const d = deps({
      prepararEdicao: {
        executar: vi.fn(async () => ({
          pendenteId: PENDENTE,
          proposta: PROPOSTA,
          transcricao: 'era 35',
        })),
      },
    });
    const ctx = {
      ...ctxVoz({ duration: 5, file_size: 1000 }),
      msg: {
        voice: { duration: 5, file_size: 1000 },
        reply_to_message: respondendoA(montarCallbackDesfazer(REGISTRO)),
      },
    };
    await tratarVoz(ctx, d);
    expect(d.prepararEdicao.executar).toHaveBeenCalledWith(REGISTRO, {
      tipo: 'audio',
      audio: Buffer.from('ogg'),
      mimeType: 'audio/ogg',
    });
    expect(ctx.reply.mock.calls[0]![0]).toBe(
      comTranscricao('era 35', formatarEdicao(PROPOSTA, HOJE)),
    );
  });

  it('voz longa demais em resposta não baixa', async () => {
    const d = deps();
    const ctx = {
      ...ctxVoz({ duration: MAX_DURACAO_AUDIO_S + 1 }),
      msg: {
        voice: { duration: MAX_DURACAO_AUDIO_S + 1 },
        reply_to_message: respondendoA(montarCallbackDesfazer(REGISTRO)),
      },
    };
    await tratarVoz(ctx, d);
    expect(d.baixarArquivo).not.toHaveBeenCalled();
    expect(d.prepararEdicao.executar).not.toHaveBeenCalled();
  });

  it('erro conhecido na correção vira mensagem amigável', async () => {
    const erro = new erros.CorrecaoVaziaError('x');
    const d = deps({ prepararEdicao: falhando(erro) });
    const ctx = ctxRespostaTexto('nada', montarCallbackDesfazer(REGISTRO));
    await tratarTexto(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(mensagemDeErro(erro));
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('c: confirma e anexa o desfecho à proposta', async () => {
    const d = deps();
    const ctx = ctxCallback(
      montarCallbackConfirmarEdicao(PENDENTE),
      'proposta',
    );
    await tratarCallback(ctx, d);
    expect(d.confirmarEdicao.executar).toHaveBeenCalledWith(PENDENTE);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      comDesfecho('proposta', MENSAGEM_EDICAO_APLICADA),
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it('c: expirada avisa sem log de erro', async () => {
    const d = deps({
      confirmarEdicao: falhando(new PendenciaExpiradaError('x')),
    });
    const ctx = ctxCallback(
      montarCallbackConfirmarEdicao(PENDENTE),
      'proposta',
    );
    await tratarCallback(ctx, d);
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      POPUP_PENDENCIA_EXPIRADA,
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('c: tira a pergunta "Confirma?" ao anexar o desfecho', async () => {
    const ctx = ctxCallback(
      montarCallbackConfirmarEdicao(PENDENTE),
      'proposta\n\nConfirma?',
    );
    await tratarCallback(ctx, deps());
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      comDesfecho('proposta', MENSAGEM_EDICAO_APLICADA),
    );
  });

  it('c: falha ao editar depois de aplicar manda o desfecho numa mensagem nova', async () => {
    const ctx = ctxCallback(
      montarCallbackConfirmarEdicao(PENDENTE),
      'proposta',
    );
    ctx.editMessageText.mockRejectedValue(new Error('message too old'));
    await tratarCallback(ctx, deps());
    expect(ctx.reply).toHaveBeenCalledWith(
      comDesfecho('proposta', MENSAGEM_EDICAO_APLICADA),
    );
  });

  it('Confirmar seguido de Cancelar: a mensagem continua "corrigido"', async () => {
    const d = deps({
      cancelarEdicao: {
        executar: vi.fn(() => {
          throw new PendenciaExpiradaError('x');
        }),
      },
    });
    const ctx = ctxCallback(
      montarCallbackConfirmarEdicao(PENDENTE),
      'proposta',
    );
    await tratarCallback(ctx, d);
    ctx.callbackQuery.data = montarCallbackCancelarEdicao(PENDENTE);
    await tratarCallback(ctx, d);
    expect(ctx.editMessageText).toHaveBeenCalledOnce();
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      comDesfecho('proposta', MENSAGEM_EDICAO_APLICADA),
    );
    expect(ctx.answerCallbackQuery).toHaveBeenLastCalledWith(
      POPUP_PENDENCIA_EXPIRADA,
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it('x: cancela', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackCancelarEdicao(PENDENTE), 'proposta');
    await tratarCallback(ctx, d);
    expect(d.cancelarEdicao.executar).toHaveBeenCalledWith(PENDENTE);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      comDesfecho('proposta', MENSAGEM_EDICAO_CANCELADA),
    );
  });
});

describe('/cartoes', () => {
  it('sem argumento lista', async () => {
    const ctx = ctxComando('');
    await tratarComandoCartoes(ctx, deps());
    expect(ctx.reply).toHaveBeenCalledWith(formatarCartoes([INTER]));
  });

  it.each([
    ['add Inter Black 3 10', 'Inter Black', 3, 10],
    ['add Nubank Roxo 3 10', 'Nubank Roxo', 3, 10],
    ['ADD  Inter   25 5', 'Inter', 25, 5],
  ])('%s cadastra', async (match, nome, diaFechamento, diaVencimento) => {
    const d = deps();
    const ctx = ctxComando(match);
    await tratarComandoCartoes(ctx, d);
    expect(d.cadastrarCartao.executar).toHaveBeenCalledWith({
      nome,
      diaFechamento,
      diaVencimento,
    });
    expect(ctx.reply).toHaveBeenCalledWith(formatarCartaoCadastrado(INTER));
  });

  it.each([
    'add Inter',
    'add Inter 3',
    'add 3 10',
    'add Inter x 10',
    'foo',
    'remover',
  ])('%s responde o uso sem chamar caso de uso', async (match) => {
    const d = deps();
    const ctx = ctxComando(match);
    await tratarComandoCartoes(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_USO_CARTOES);
    expect(d.cadastrarCartao.executar).not.toHaveBeenCalled();
    expect(d.removerCartao.executar).not.toHaveBeenCalled();
  });

  it('remover <nome com espaço>', async () => {
    const d = deps();
    const ctx = ctxComando('remover Inter Black');
    await tratarComandoCartoes(ctx, d);
    expect(d.removerCartao.executar).toHaveBeenCalledWith('Inter Black');
    expect(ctx.reply).toHaveBeenCalledWith(formatarCartaoRemovido(INTER));
  });

  it('cartão em uso vira mensagem amigável', async () => {
    const d = deps({ removerCartao: falhando(new CartaoEmUsoError('x')) });
    const ctx = ctxComando('remover Inter');
    await tratarComandoCartoes(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new CartaoEmUsoError('x')),
    );
  });
});

describe('/fatura', () => {
  it('sem argumento consulta todas', async () => {
    const d = deps();
    const ctx = ctxComando('');
    await tratarComandoFatura(ctx, d);
    expect(d.consultarFatura.executar).toHaveBeenCalledWith({
      cartao: null,
      mes: null,
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      formatarFaturas([{ cartao: INTER, composicao: COMPOSICAO }]),
    );
  });

  it.each([
    ['Inter', { cartao: 'Inter', mes: null }],
    ['Inter Black', { cartao: 'Inter Black', mes: null }],
    ['Inter 1/2027', { cartao: 'Inter', mes: '2027-01' }],
  ])('%s consulta', async (match, esperado) => {
    const d = deps();
    await tratarComandoFatura(ctxComando(match), d);
    expect(d.consultarFatura.executar).toHaveBeenCalledWith(esperado);
    expect(d.informarFatura.executar).not.toHaveBeenCalled();
  });

  it.each([
    ['Inter 400 11/2026', { cartao: 'Inter', valorReais: 400, mes: '2026-11' }],
    [
      'Inter Black 1.234,56',
      { cartao: 'Inter Black', valorReais: 1234.56, mes: null },
    ],
    ['Inter 0', { cartao: 'Inter', valorReais: 0, mes: null }],
    ['Inter 0.00', { cartao: 'Inter', valorReais: 0, mes: null }],
    ['Inter 0,0', { cartao: 'Inter', valorReais: 0, mes: null }],
    ['400', { cartao: null, valorReais: 400, mes: null }],
  ])('%s informa', async (match, esperado) => {
    const d = deps();
    const ctx = ctxComando(match);
    await tratarComandoFatura(ctx, d);
    expect(d.informarFatura.executar).toHaveBeenCalledWith(esperado);
    expect(ctx.reply.mock.calls[0]![0]).toContain('valor inicial');
  });

  it('valor inválido responde a mensagem de valor', async () => {
    const d = deps();
    const ctx = ctxComando('Inter 4,5');
    await tratarComandoFatura(ctx, d);
    expect(d.informarFatura.executar).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      mensagemDeErro(new ValorInvalidoError('x')),
    );
  });

  it('só o mês responde o uso', async () => {
    const d = deps();
    const ctx = ctxComando('11/2026');
    await tratarComandoFatura(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(MENSAGEM_USO_FATURA);
  });
});

describe('/parcelamentos', () => {
  it('lista com botão 🗑️ por item', async () => {
    const ctx = respostas();
    await tratarComandoParcelamentos(ctx, deps());
    const [texto, extra] = ctx.reply.mock.calls[0]!;
    expect(texto).toBe(formatarParcelamentos([ITEM_PARCELAMENTO]));
    expect(tecladoDe(extra)).toEqual([
      {
        text: '🗑️ Monitor',
        callback_data: montarCallbackPedirRemocao(PARCELAMENTO.id),
      },
    ]);
  });

  it('no máximo 10 itens', async () => {
    const d = deps({
      listarParcelamentos: {
        executar: vi.fn(async () => Array(12).fill(ITEM_PARCELAMENTO)),
      },
    });
    const ctx = respostas();
    await tratarComandoParcelamentos(ctx, d);
    expect(tecladoDe(ctx.reply.mock.calls[0]![1])).toHaveLength(10);
    expect(ctx.reply.mock.calls[0]![0]).toContain(
      '+2 parcelamento(s) não listado(s)',
    );
  });

  it('vazio responde sem teclado', async () => {
    const d = deps({
      listarParcelamentos: { executar: vi.fn(async () => []) },
    });
    const ctx = respostas();
    await tratarComandoParcelamentos(ctx, d);
    expect(ctx.reply).toHaveBeenCalledWith(formatarParcelamentos([]));
  });

  it('remover → confirmar remove; manter fecha a pergunta', async () => {
    const d = deps();
    const pedir = ctxCallback(montarCallbackPedirRemocao(PARCELAMENTO.id));
    await tratarCallback(pedir, d);
    const [texto, extra] = pedir.reply.mock.calls[0]!;
    expect(texto).toBe(formatarPedidoDeRemocao(PARCELAMENTO));
    expect(tecladoDe(extra).map((b) => b.callback_data)).toEqual([
      montarCallbackConfirmarRemocao(PARCELAMENTO.id),
      CALLBACK_MANTER_PARCELAMENTO,
    ]);
    expect(d.removerParcelamento.executar).not.toHaveBeenCalled();

    const confirmar = ctxCallback(
      montarCallbackConfirmarRemocao(PARCELAMENTO.id),
    );
    await tratarCallback(confirmar, d);
    expect(d.removerParcelamento.executar).toHaveBeenCalledWith(
      PARCELAMENTO.id,
    );
    expect(confirmar.editMessageText).toHaveBeenCalledWith(
      MENSAGEM_PARCELAMENTO_REMOVIDO,
    );

    const manter = ctxCallback(CALLBACK_MANTER_PARCELAMENTO);
    await tratarCallback(manter, d);
    expect(manter.editMessageText).toHaveBeenCalledWith(
      MENSAGEM_PARCELAMENTO_MANTIDO,
    );
  });

  it('pedir remoção de parcelamento que já não existe', async () => {
    const d = deps();
    const ctx = ctxCallback(montarCallbackPedirRemocao(PENDENTE));
    await tratarCallback(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      POPUP_PARCELAMENTO_INEXISTENTE,
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('confirmar remoção já feita', async () => {
    const d = deps({
      removerParcelamento: { executar: vi.fn(async () => false) },
    });
    const ctx = ctxCallback(montarCallbackConfirmarRemocao(PARCELAMENTO.id));
    await tratarCallback(ctx, d);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      POPUP_PARCELAMENTO_INEXISTENTE,
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });
});
