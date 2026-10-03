import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { TETO_VALOR_CENTAVOS } from '../../domain/gasto.js';
import { GeminiExtrator, type ModelosGemini } from './gemini.extrator.js';
import { instrucaoDeSistema, mensagemDoUsuario } from './prompt.js';
import { respostaExtracaoJsonSchema } from './schema.js';

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

  it.each([429, 500, 503])(
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

  it.each([400, 401, 403])(
    'status %i é relançado como está',
    async (status) => {
      const erro = apiError(status);
      const { extrator } = criar(erro);
      await expect(extrairTexto(extrator)).rejects.toBe(erro);
    },
  );

  it('recusa áudio sem chamar o SDK', async () => {
    const { extrator, generateContent } = criar({ text: '{}' });
    await expect(
      extrator.extrair(
        { tipo: 'audio', audio: Buffer.from('x'), mimeType: 'audio/ogg' },
        DATA,
      ),
    ).rejects.toThrow(/áudio não suportado/i);
    expect(generateContent).not.toHaveBeenCalled();
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

    it('valor absurdo passa no schema, mas o teto do domínio o barra', async () => {
      const { extrator } = criar({
        text: JSON.stringify({
          gastos: [{ ...GASTO, valorReais: 1_000_000, categoria: 'lazer' }],
        }),
      });
      const { gastos } = await extrairTexto(extrator);
      expect(Dinheiro.deReais(gastos[0]!.valorReais).centavos).toBeGreaterThan(
        TETO_VALOR_CENTAVOS,
      );
    });
  });
});
