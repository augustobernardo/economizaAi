import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { ValorAcimaDoTetoError } from '../../domain/errors.js';
import { Gasto } from '../../domain/gasto.js';
import {
  GeminiInterpretador,
  MAX_TOKENS_SAIDA,
  type ModelosGemini,
} from './gemini.interpretador.js';
import {
  INSTRUCAO_AUDIO,
  instrucaoDeCorrecao,
  instrucaoDeSistema,
  mensagemDoUsuario,
  VERSOES_PROMPT,
  type VersaoPrompt,
} from './prompt.js';
import {
  respostaCorrecaoAudioJsonSchema,
  respostaCorrecaoJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV6,
  respostaInterpretacaoJsonSchemaV6,
  respostaInterpretacaoAudioJsonSchemaV5,
  respostaInterpretacaoJsonSchemaV5,
} from './schema.js';

const DATA = new Date('2026-10-03T15:00:00Z');
const TEXTO = 'ontem gastei 32,50 de uber';
const GASTO = {
  valorReais: 32.5,
  categoria: 'transporte',
  descricao: 'Uber',
  dataGasto: '2026-10-02',
};

const resp = (campos: Record<string, unknown>) =>
  JSON.stringify({
    intencao: 'registrar',
    gastos: [],
    inicio: null,
    fim: null,
    ...campos,
  });

/** Versão v5 por padrão: os testes legados usam o formato antigo (v1–v5). */
function criar(
  resposta: { text?: string } | Error,
  versao: VersaoPrompt = 'v5',
) {
  const generateContent = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const interpretador = new GeminiInterpretador(
    { generateContent } as unknown as ModelosGemini,
    'modelo-x',
    versao,
  );
  return { interpretador, generateContent };
}

const interpretarTexto = (interpretador: GeminiInterpretador) =>
  interpretador.interpretar({ tipo: 'texto', texto: TEXTO }, DATA);

const apiError = (status: number) =>
  new ApiError({ message: 'falhou', status });

describe('GeminiInterpretador', () => {
  it('chama o SDK com modelo, instrução, schema e mensagem delimitada', async () => {
    const { interpretador, generateContent } = criar({
      text: resp({ gastos: [] }),
    });

    await interpretarTexto(interpretador);

    expect(generateContent).toHaveBeenCalledWith({
      model: 'modelo-x',
      contents: mensagemDoUsuario(TEXTO),
      config: {
        systemInstruction: instrucaoDeSistema(DATA, 'texto', 'v5'),
        temperature: 0,
        maxOutputTokens: MAX_TOKENS_SAIDA,
        responseMimeType: 'application/json',
        responseJsonSchema: respostaInterpretacaoJsonSchemaV5,
      },
    });
    expect(MAX_TOKENS_SAIDA).toBe(4096);
  });

  it('usa a versão de prompt informada no construtor', async () => {
    const generateContent = vi.fn(async () => ({ text: resp({ gastos: [] }) }));
    const versionado = new GeminiInterpretador(
      { generateContent } as unknown as ModelosGemini,
      'modelo-x',
      'v1',
    );

    await interpretarTexto(versionado);

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          systemInstruction: VERSOES_PROMPT.v1(DATA, 'texto'),
        }),
      }),
    );
  });

  it.each(['texto', 'audio'] as const)(
    'v5 envia o JSON Schema com descrições (%s)',
    async (tipo) => {
      const generateContent = vi.fn(async () => ({
        text: resp(tipo === 'audio' ? { transcricao: 'x' } : {}),
      }));
      const v5 = new GeminiInterpretador(
        { generateContent } as unknown as ModelosGemini,
        'modelo-x',
        'v5',
      );
      await (tipo === 'texto'
        ? interpretarTexto(v5)
        : v5.interpretar(
            { tipo: 'audio', audio: Buffer.from('a'), mimeType: 'audio/ogg' },
            DATA,
          ));
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseJsonSchema:
              tipo === 'texto'
                ? respostaInterpretacaoJsonSchemaV5
                : respostaInterpretacaoAudioJsonSchemaV5,
          }),
        }),
      );
    },
  );

  it('devolve os gastos e o texto original', async () => {
    const { interpretador } = criar({ text: resp({ gastos: [GASTO] }) });

    expect(await interpretarTexto(interpretador)).toEqual({
      intencao: 'registrar',
      gastos: [{ ...GASTO, cartao: null, formaPagamento: null }],
      entradas: [],
      parcelamentos: [],
      textoOriginal: TEXTO,
    });
  });

  describe('intenções', () => {
    it.each(['exportar', 'resumir'] as const)(
      '%s devolve o período e o texto original',
      async (intencao) => {
        const { interpretador } = criar({
          text: resp({ intencao, inicio: '2026-09-01', fim: '2026-09-30' }),
        });
        expect(await interpretarTexto(interpretador)).toEqual({
          intencao,
          inicio: '2026-09-01',
          fim: '2026-09-30',
          textoOriginal: TEXTO,
        });
      },
    );

    it('listarUltimos devolve só a intenção e o texto original', async () => {
      const { interpretador } = criar({
        text: resp({ intencao: 'listarUltimos' }),
      });
      expect(await interpretarTexto(interpretador)).toEqual({
        intencao: 'listarUltimos',
        textoOriginal: TEXTO,
      });
    });

    it.each(['exportar', 'resumir'])(
      '%s sem inicio ou fim → RespostaInvalidaDaIaError',
      async (intencao) => {
        for (const periodo of [
          { inicio: null, fim: '2026-09-30' },
          { inicio: '2026-09-01', fim: null },
        ]) {
          const { interpretador } = criar({
            text: resp({ intencao, ...periodo }),
          });
          await expect(interpretarTexto(interpretador)).rejects.toBeInstanceOf(
            RespostaInvalidaDaIaError,
          );
        }
      },
    );

    it.each(['exportar', 'resumir', 'listarUltimos'] as const)(
      'áudio: %s usa a transcrição como textoOriginal',
      async (intencao) => {
        const { interpretador } = criar({
          text: resp({
            intencao,
            inicio: '2026-09-01',
            fim: '2026-09-30',
            transcricao: 'minha fala',
          }),
        });
        const r = await interpretador.interpretar(
          { tipo: 'audio', audio: Buffer.from('a'), mimeType: 'audio/ogg' },
          DATA,
        );
        expect(r.intencao).toBe(intencao);
        expect(r.textoOriginal).toBe('minha fala');
      },
    );
  });

  it.each([
    ['texto vazio', ''],
    ['texto ausente', undefined],
    ['não é JSON', 'não é json'],
    ['fora do schema', resp({ gastos: [{ valorReais: 'x' }] })],
  ])(
    'resposta inválida (%s) vira RespostaInvalidaDaIaError',
    async (_n, text) => {
      const { interpretador } = criar({ text });
      await expect(interpretarTexto(interpretador)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    },
  );

  it.each([408, 429, 500, 503])(
    'status %i vira ProvedorIndisponivelError',
    async (status) => {
      const { interpretador } = criar(apiError(status));
      await expect(interpretarTexto(interpretador)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    },
  );

  it('timeout (AbortError) e falha de rede viram ProvedorIndisponivelError', async () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    for (const erro of [abort, new TypeError('fetch failed')]) {
      const { interpretador } = criar(erro);
      await expect(interpretarTexto(interpretador)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    }
  });

  it('TypeError que não é falha de rede é relançado', async () => {
    const erro = new TypeError('x is not a function');
    const { interpretador } = criar(erro);
    await expect(interpretarTexto(interpretador)).rejects.toBe(erro);
  });

  it.each([400, 401, 403])(
    'status %i é relançado como está',
    async (status) => {
      const erro = apiError(status);
      const { interpretador } = criar(erro);
      await expect(interpretarTexto(interpretador)).rejects.toBe(erro);
    },
  );

  describe('áudio', () => {
    const AUDIO = Buffer.from('opus-fake');

    const interpretarAudio = (
      interpretador: GeminiInterpretador,
      mimeType = 'audio/ogg',
    ) =>
      interpretador.interpretar(
        { tipo: 'audio', audio: AUDIO, mimeType },
        DATA,
      );

    it('envia o áudio inline em base64 com a instrução e o schema de áudio', async () => {
      const { interpretador, generateContent } = criar({
        text: resp({ gastos: [], transcricao: 'oi' }),
      });

      await interpretarAudio(interpretador);

      expect(generateContent).toHaveBeenCalledWith({
        model: 'modelo-x',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/ogg',
                  data: AUDIO.toString('base64'),
                },
              },
              { text: INSTRUCAO_AUDIO },
            ],
          },
        ],
        config: {
          systemInstruction: instrucaoDeSistema(DATA, 'audio', 'v5'),
          temperature: 0,
          maxOutputTokens: MAX_TOKENS_SAIDA,
          responseMimeType: 'application/json',
          responseJsonSchema: respostaInterpretacaoAudioJsonSchemaV5,
        },
      });
    });

    it('devolve os gastos e a transcrição como textoOriginal', async () => {
      const { interpretador } = criar({
        text: resp({
          gastos: [GASTO],
          transcricao: 'ontem 32,50 de uber',
        }),
      });

      expect(await interpretarAudio(interpretador)).toEqual({
        intencao: 'registrar',
        gastos: [{ ...GASTO, cartao: null, formaPagamento: null }],
        entradas: [],
        parcelamentos: [],
        textoOriginal: 'ontem 32,50 de uber',
      });
    });

    it('resposta sem transcricao → RespostaInvalidaDaIaError', async () => {
      const { interpretador } = criar({ text: resp({ gastos: [GASTO] }) });
      await expect(interpretarAudio(interpretador)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    });

    it('MIME não suportado não chama o SDK', async () => {
      const { interpretador, generateContent } = criar({ text: '{}' });
      await expect(
        interpretarAudio(interpretador, 'audio/mpeg'),
      ).rejects.toThrow(/formato de áudio não suportado/i);
      expect(generateContent).not.toHaveBeenCalled();
    });

    it('erro transitório → ProvedorIndisponivelError', async () => {
      const { interpretador } = criar(apiError(503));
      await expect(interpretarAudio(interpretador)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    });
  });

  describe('injection', () => {
    it('resposta obediente com campo extra é rejeitada', async () => {
      const { interpretador } = criar({
        text: resp({
          gastos: [{ ...GASTO, valorReais: 1_000_000, categoria: 'lazer' }],
          instrucao: 'ok',
        }),
      });
      await expect(interpretarTexto(interpretador)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    });

    it('valor absurdo passa no schema, mas o domínio o barra', async () => {
      const { interpretador } = criar({
        text: resp({
          gastos: [{ ...GASTO, valorReais: 1_000_000, categoria: 'lazer' }],
        }),
      });
      const resultado = await interpretarTexto(interpretador);
      if (resultado.intencao !== 'registrar')
        throw new Error('esperava registrar');
      const [gasto] = resultado.gastos;
      expect(() =>
        Gasto.criar({
          valor: Dinheiro.deReais(gasto!.valorReais),
          categoria: 'lazer',
          descricao: gasto!.descricao,
          dataGasto: gasto!.dataGasto,
          origem: 'texto',
          textoOriginal: TEXTO,
          agora: DATA,
          registroId: crypto.randomUUID(),
        }),
      ).toThrow(ValorAcimaDoTetoError);
    });
  });
});

describe('GeminiInterpretador v6', () => {
  const CONTEXTO = { cartoes: ['Nubank', 'Itaú'] };
  const v6 = (campos: Record<string, unknown> = {}) =>
    JSON.stringify({
      intencao: 'registrar',
      gastos: [],
      entradas: [],
      parcelamentos: [],
      inicio: null,
      fim: null,
      fatura: null,
      ...campos,
    });
  const criarV6 = (text: string | Error) =>
    criar(text instanceof Error ? text : { text }, 'v6');
  const interpretar6 = (i: GeminiInterpretador) =>
    i.interpretar({ tipo: 'texto', texto: TEXTO }, DATA, CONTEXTO);

  const parcelamento = {
    descricao: 'Celular',
    categoria: 'outros',
    cartao: 'Nubank',
    totalReais: null,
    valorParcelaReais: 150,
    quantidade: 10,
    parcelaAtual: 3,
    dataCompra: '2026-10-05',
  };

  it('é a versão padrão e envia contexto.cartoes, schema v6 e maxOutputTokens', async () => {
    const generateContent = vi.fn(async () => ({ text: v6() }));
    const padrao = new GeminiInterpretador(
      { generateContent } as unknown as ModelosGemini,
      'modelo-x',
    );
    await interpretar6(padrao);
    const { config } = (generateContent.mock.calls[0] as any)[0];
    expect(config.systemInstruction).toBe(
      instrucaoDeSistema(DATA, 'texto', 'v6', CONTEXTO),
    );
    expect(config.systemInstruction).toContain(
      '<cartoes>\nNubank\nItaú\n</cartoes>',
    );
    expect(config.responseJsonSchema).toBe(respostaInterpretacaoJsonSchemaV6);
    expect(config.maxOutputTokens).toBe(MAX_TOKENS_SAIDA);
  });

  it('registrar devolve gastos com cartão, entradas e parcelamentos', async () => {
    const gasto = { ...GASTO, cartao: 'Nubank', formaPagamento: 'credito' };
    const entrada = {
      valorReais: 50,
      categoria: 'reembolso',
      descricao: 'Estorno',
      dataEntrada: '2026-10-02',
      cartao: 'Nubank',
      mesFatura: '2026-10',
    };
    const { interpretador } = criarV6(
      v6({
        gastos: [gasto],
        entradas: [entrada],
        parcelamentos: [parcelamento],
      }),
    );
    expect(await interpretar6(interpretador)).toEqual({
      intencao: 'registrar',
      gastos: [gasto],
      entradas: [entrada],
      parcelamentos: [parcelamento],
      textoOriginal: TEXTO,
    });
  });

  it('parcelaAtual > quantidade → RespostaInvalidaDaIaError', async () => {
    const { interpretador } = criarV6(
      v6({ parcelamentos: [{ ...parcelamento, parcelaAtual: 11 }] }),
    );
    await expect(interpretar6(interpretador)).rejects.toBeInstanceOf(
      RespostaInvalidaDaIaError,
    );
  });

  it('parcelamento sem total nem parcela → RespostaInvalidaDaIaError', async () => {
    const { interpretador } = criarV6(
      v6({ parcelamentos: [{ ...parcelamento, valorParcelaReais: null }] }),
    );
    await expect(interpretar6(interpretador)).rejects.toBeInstanceOf(
      RespostaInvalidaDaIaError,
    );
  });

  it('informarFatura mapeia cartão, mês e valor', async () => {
    const { interpretador } = criarV6(
      v6({
        intencao: 'informarFatura',
        fatura: { cartao: 'Nubank', mes: '2026-11', valorReais: 400 },
      }),
    );
    expect(await interpretar6(interpretador)).toEqual({
      intencao: 'informarFatura',
      cartao: 'Nubank',
      mes: '2026-11',
      valorReais: 400,
      textoOriginal: TEXTO,
    });
  });

  it.each([
    ['sem fatura', null],
    ['valor nulo', { cartao: 'Nubank', mes: null, valorReais: null }],
  ])('informarFatura %s → RespostaInvalidaDaIaError', async (_n, fatura) => {
    const { interpretador } = criarV6(
      v6({ intencao: 'informarFatura', fatura }),
    );
    await expect(interpretar6(interpretador)).rejects.toBeInstanceOf(
      RespostaInvalidaDaIaError,
    );
  });

  it('consultarFatura aceita fatura nula', async () => {
    const { interpretador } = criarV6(v6({ intencao: 'consultarFatura' }));
    expect(await interpretar6(interpretador)).toEqual({
      intencao: 'consultarFatura',
      cartao: null,
      mes: null,
      textoOriginal: TEXTO,
    });
  });

  it('exportar continua exigindo período', async () => {
    const { interpretador } = criarV6(v6({ intencao: 'exportar' }));
    await expect(interpretar6(interpretador)).rejects.toBeInstanceOf(
      RespostaInvalidaDaIaError,
    );
  });

  it('áudio: usa schema de áudio v6 e a transcrição', async () => {
    const { interpretador, generateContent } = criarV6(
      v6({ transcricao: 'fatura do nubank', intencao: 'consultarFatura' }),
    );
    const r = await interpretador.interpretar(
      { tipo: 'audio', audio: Buffer.from('a'), mimeType: 'audio/ogg' },
      DATA,
      CONTEXTO,
    );
    expect(r.textoOriginal).toBe('fatura do nubank');
    expect(
      (generateContent.mock.calls[0] as any)[0].config.responseJsonSchema,
    ).toBe(respostaInterpretacaoAudioJsonSchemaV6);
  });

  describe('correção', () => {
    const ITENS = [
      {
        tipo: 'gasto' as const,
        indice: 1,
        valorReais: 30,
        categoria: 'transporte',
        descricao: 'Uber',
        data: '2026-10-04',
        cartao: 'Nubank',
        formaPagamento: 'credito' as const,
      },
      {
        tipo: 'entrada' as const,
        indice: 2,
        valorReais: 100,
        categoria: 'outros',
        descricao: 'Pix',
        data: '2026-10-03',
      },
      {
        tipo: 'gasto' as const,
        indice: 3,
        valorReais: 10,
        categoria: 'lazer',
        descricao: 'Cinema',
        data: '2026-10-02',
        cartao: null,
        formaPagamento: null,
      },
    ];
    const alt = (campos: Record<string, unknown>) => ({
      indice: 1,
      valorReais: null,
      categoria: null,
      descricao: null,
      data: null,
      cartao: null,
      formaPagamento: null,
      removerCartao: false,
      ...campos,
    });
    const corr = (campos: Record<string, unknown>) =>
      JSON.stringify({
        alteracoes: [],
        remover: [],
        acrescentar: [],
        ...campos,
      });
    const corrigir = (i: GeminiInterpretador) =>
      i.interpretarCorrecao(
        { tipo: 'texto', texto: 'era 40' },
        ITENS,
        DATA,
        CONTEXTO,
      );

    it('envia itens, cartões e schema de correção; omite campos null', async () => {
      const { interpretador, generateContent } = criar(
        { text: corr({ alteracoes: [alt({ valorReais: 40 })], remover: [2] }) },
        'v6',
      );
      expect(await corrigir(interpretador)).toEqual({
        alteracoes: [{ indice: 1, valorReais: 40 }],
        remover: [2],
        acrescentar: [],
        textoOriginal: 'era 40',
      });
      expect(generateContent).toHaveBeenCalledWith({
        model: 'modelo-x',
        contents: mensagemDoUsuario('era 40'),
        config: expect.objectContaining({
          systemInstruction: instrucaoDeCorrecao(ITENS, DATA, CONTEXTO),
          responseJsonSchema: respostaCorrecaoJsonSchema,
          maxOutputTokens: MAX_TOKENS_SAIDA,
        }),
      });
    });

    it('removerCartao vira cartao e formaPagamento null; cartão novo vira string', async () => {
      const { interpretador } = criar(
        {
          text: corr({
            alteracoes: [
              alt({ removerCartao: true }),
              alt({ indice: 3, cartao: 'Itaú', formaPagamento: 'debito' }),
            ],
          }),
        },
        'v6',
      );
      const r = await corrigir(interpretador);
      expect(r.alteracoes).toEqual([
        { indice: 1, cartao: null, formaPagamento: null },
        { indice: 3, cartao: 'Itaú', formaPagamento: 'debito' },
      ]);
    });

    it.each([
      ['alteração com índice 0', corr({ alteracoes: [alt({ indice: 0 })] })],
      ['alteração com índice > n', corr({ alteracoes: [alt({ indice: 4 })] })],
      ['remover índice > n', corr({ remover: [4] })],
      [
        'categoria de gasto em entrada',
        corr({ alteracoes: [alt({ indice: 2, categoria: 'lazer' })] }),
      ],
      [
        'removerCartao com cartão',
        corr({ alteracoes: [alt({ removerCartao: true, cartao: 'X' })] }),
      ],
      ['campo extra', corr({ extra: 1 })],
      [
        'índice repetido em alteracoes',
        corr({ alteracoes: [alt({ valorReais: 1 }), alt({ valorReais: 2 })] }),
      ],
      ['índice repetido em remover', corr({ remover: [2, 2] })],
      [
        'índice alterado e removido',
        corr({ alteracoes: [alt({ valorReais: 1 })], remover: [1] }),
      ],
      [
        'cartão em entrada',
        corr({ alteracoes: [alt({ indice: 2, cartao: 'Nubank' })] }),
      ],
      [
        'removerCartao em entrada',
        corr({ alteracoes: [alt({ indice: 2, removerCartao: true })] }),
      ],
    ])('%s → RespostaInvalidaDaIaError', async (_n, text) => {
      const { interpretador } = criar({ text }, 'v6');
      await expect(corrigir(interpretador)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    });

    it('acrescentar devolve gastos extraídos', async () => {
      const novo = { ...GASTO, cartao: null, formaPagamento: null };
      const { interpretador } = criar(
        { text: corr({ acrescentar: [novo] }) },
        'v6',
      );
      expect((await corrigir(interpretador)).acrescentar).toEqual([novo]);
    });

    it('áudio: transcrição vira textoOriginal e usa schema de áudio', async () => {
      const { interpretador, generateContent } = criar(
        { text: corr({ transcricao: 'era quarenta' }) },
        'v6',
      );
      const r = await interpretador.interpretarCorrecao(
        { tipo: 'audio', audio: Buffer.from('a'), mimeType: 'audio/ogg' },
        ITENS,
        DATA,
        CONTEXTO,
      );
      expect(r.textoOriginal).toBe('era quarenta');
      expect(
        (generateContent.mock.calls[0] as any)[0].config.responseJsonSchema,
      ).toBe(respostaCorrecaoAudioJsonSchema);
    });

    it('áudio com MIME não suportado não chama o SDK', async () => {
      const { interpretador, generateContent } = criar({ text: '{}' }, 'v6');
      await expect(
        interpretador.interpretarCorrecao(
          { tipo: 'audio', audio: Buffer.from('a'), mimeType: 'audio/mpeg' },
          ITENS,
          DATA,
          CONTEXTO,
        ),
      ).rejects.toThrow(/formato de áudio/i);
      expect(generateContent).not.toHaveBeenCalled();
    });

    it('erro transitório → ProvedorIndisponivelError', async () => {
      const { interpretador } = criar(apiError(503), 'v6');
      await expect(corrigir(interpretador)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    });
  });
});
