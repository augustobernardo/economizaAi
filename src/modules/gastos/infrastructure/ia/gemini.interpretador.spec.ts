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
  instrucaoDeSistema,
  mensagemDoUsuario,
  VERSOES_PROMPT,
} from './prompt.js';
import {
  respostaInterpretacaoAudioJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV5,
  respostaInterpretacaoJsonSchema,
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

function criar(resposta: { text?: string } | Error) {
  const generateContent = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const interpretador = new GeminiInterpretador(
    { generateContent } as unknown as ModelosGemini,
    'modelo-x',
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
        systemInstruction: instrucaoDeSistema(DATA),
        temperature: 0,
        maxOutputTokens: MAX_TOKENS_SAIDA,
        responseMimeType: 'application/json',
        responseJsonSchema: respostaInterpretacaoJsonSchemaV5,
      },
    });
    expect(MAX_TOKENS_SAIDA).toBe(2048);
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
      gastos: [GASTO],
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
          systemInstruction: instrucaoDeSistema(DATA, 'audio'),
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
        gastos: [GASTO],
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
