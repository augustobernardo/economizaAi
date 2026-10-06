import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { ValorAcimaDoTetoError } from '../../domain/errors.js';
import { Gasto } from '../../domain/gasto.js';
import { GeminiExtrator, type ModelosGemini } from './gemini.extrator.js';
import {
  INSTRUCAO_AUDIO,
  instrucaoDeSistema,
  mensagemDoUsuario,
} from './prompt.js';
import {
  respostaExtracaoAudioJsonSchema,
  respostaExtracaoJsonSchema,
} from './schema.js';

const DATA = new Date('2026-10-03T15:00:00Z');
const TEXTO = 'ontem gastei 32,50 de uber';
const GASTO = {
  valorReais: 32.5,
  categoria: 'transporte',
  descricao: 'Uber',
  dataGasto: '2026-10-02',
};

function criar(resposta: { text?: string } | Error) {
  const generateContent = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  const extrator = new GeminiExtrator(
    { generateContent } as unknown as ModelosGemini,
    'modelo-x',
  );
  return { extrator, generateContent };
}

const extrairTexto = (extrator: GeminiExtrator) =>
  extrator.extrair({ tipo: 'texto', texto: TEXTO }, DATA);

const apiError = (status: number) =>
  new ApiError({ message: 'falhou', status });

describe('GeminiExtrator', () => {
  it('chama o SDK com modelo, instrução, schema e mensagem delimitada', async () => {
    const { extrator, generateContent } = criar({
      text: JSON.stringify({ gastos: [] }),
    });

    await extrairTexto(extrator);

    expect(generateContent).toHaveBeenCalledWith({
      model: 'modelo-x',
      contents: mensagemDoUsuario(TEXTO),
      config: {
        systemInstruction: instrucaoDeSistema(DATA),
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: respostaExtracaoJsonSchema,
      },
    });
  });

  it('devolve os gastos e o texto original', async () => {
    const { extrator } = criar({ text: JSON.stringify({ gastos: [GASTO] }) });

    expect(await extrairTexto(extrator)).toEqual({
      gastos: [GASTO],
      textoOriginal: TEXTO,
    });
  });

  it.each([
    ['texto vazio', ''],
    ['texto ausente', undefined],
    ['não é JSON', 'não é json'],
    ['fora do schema', JSON.stringify({ gastos: [{ valorReais: 'x' }] })],
  ])(
    'resposta inválida (%s) vira RespostaInvalidaDaIaError',
    async (_n, text) => {
      const { extrator } = criar({ text });
      await expect(extrairTexto(extrator)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    },
  );

  it.each([408, 429, 500, 503])(
    'status %i vira ProvedorIndisponivelError',
    async (status) => {
      const { extrator } = criar(apiError(status));
      await expect(extrairTexto(extrator)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    },
  );

  it('timeout (AbortError) e falha de rede viram ProvedorIndisponivelError', async () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    for (const erro of [abort, new TypeError('fetch failed')]) {
      const { extrator } = criar(erro);
      await expect(extrairTexto(extrator)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    }
  });

  it('TypeError que não é falha de rede é relançado', async () => {
    const erro = new TypeError('x is not a function');
    const { extrator } = criar(erro);
    await expect(extrairTexto(extrator)).rejects.toBe(erro);
  });

  it.each([400, 401, 403])(
    'status %i é relançado como está',
    async (status) => {
      const erro = apiError(status);
      const { extrator } = criar(erro);
      await expect(extrairTexto(extrator)).rejects.toBe(erro);
    },
  );

  describe('áudio', () => {
    const AUDIO = Buffer.from('opus-fake');

    const extrairAudio = (extrator: GeminiExtrator, mimeType = 'audio/ogg') =>
      extrator.extrair({ tipo: 'audio', audio: AUDIO, mimeType }, DATA);

    it('envia o áudio inline em base64 com a instrução e o schema de áudio', async () => {
      const { extrator, generateContent } = criar({
        text: JSON.stringify({ gastos: [], transcricao: 'oi' }),
      });

      await extrairAudio(extrator);

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
          responseMimeType: 'application/json',
          responseJsonSchema: respostaExtracaoAudioJsonSchema,
        },
      });
    });

    it('devolve os gastos e a transcrição como textoOriginal', async () => {
      const { extrator } = criar({
        text: JSON.stringify({
          gastos: [GASTO],
          transcricao: 'ontem 32,50 de uber',
        }),
      });

      expect(await extrairAudio(extrator)).toEqual({
        gastos: [GASTO],
        textoOriginal: 'ontem 32,50 de uber',
      });
    });

    it('resposta sem transcricao → RespostaInvalidaDaIaError', async () => {
      const { extrator } = criar({ text: JSON.stringify({ gastos: [GASTO] }) });
      await expect(extrairAudio(extrator)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    });

    it('MIME não suportado não chama o SDK', async () => {
      const { extrator, generateContent } = criar({ text: '{}' });
      await expect(extrairAudio(extrator, 'audio/mpeg')).rejects.toThrow(
        /formato de áudio não suportado/i,
      );
      expect(generateContent).not.toHaveBeenCalled();
    });

    it('erro transitório → ProvedorIndisponivelError', async () => {
      const { extrator } = criar(apiError(503));
      await expect(extrairAudio(extrator)).rejects.toBeInstanceOf(
        ProvedorIndisponivelError,
      );
    });
  });

  describe('injection', () => {
    it('resposta obediente com campo extra é rejeitada', async () => {
      const { extrator } = criar({
        text: JSON.stringify({
          gastos: [{ ...GASTO, valorReais: 1_000_000, categoria: 'lazer' }],
          instrucao: 'ok',
        }),
      });
      await expect(extrairTexto(extrator)).rejects.toBeInstanceOf(
        RespostaInvalidaDaIaError,
      );
    });

    it('valor absurdo passa no schema, mas o domínio o barra', async () => {
      const { extrator } = criar({
        text: JSON.stringify({
          gastos: [{ ...GASTO, valorReais: 1_000_000, categoria: 'lazer' }],
        }),
      });
      const { gastos } = await extrairTexto(extrator);
      const [gasto] = gastos;
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
