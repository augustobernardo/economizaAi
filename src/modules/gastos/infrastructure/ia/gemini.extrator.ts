import { ApiError, GoogleGenAI, type ContentListUnion } from '@google/genai';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type {
  EntradaExtracao,
  ExtratorDeGastos,
  ResultadoExtracao,
} from '../../application/ports/extrator-de-gastos.js';
import { z } from 'zod';
import {
  INSTRUCAO_AUDIO,
  instrucaoDeSistema,
  mensagemDoUsuario,
} from './prompt.js';
import {
  respostaExtracaoAudioJsonSchema,
  respostaExtracaoAudioSchema,
  respostaExtracaoJsonSchema,
  respostaExtracaoSchema,
} from './schema.js';

export type ModelosGemini = Pick<GoogleGenAI['models'], 'generateContent'>;

export const MIMES_DE_AUDIO_SUPORTADOS = ['audio/ogg'] as const;

export const TIMEOUT_GEMINI_MS = 20_000;

export function criarModelosGemini(apiKey: string): ModelosGemini {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: TIMEOUT_GEMINI_MS },
  }).models;
}

export class GeminiExtrator implements ExtratorDeGastos {
  constructor(
    private readonly modelos: ModelosGemini,
    private readonly modelo: string,
  ) {}

  async extrair(
    entrada: EntradaExtracao,
    dataReferencia: Date,
  ): Promise<ResultadoExtracao> {
    if (entrada.tipo === 'texto') {
      const texto = await this.chamar(
        mensagemDoUsuario(entrada.texto),
        instrucaoDeSistema(dataReferencia, 'texto'),
        respostaExtracaoJsonSchema,
      );
      return {
        gastos: interpretar(texto, respostaExtracaoSchema).gastos,
        textoOriginal: entrada.texto,
      };
    }

    if (
      !(MIMES_DE_AUDIO_SUPORTADOS as readonly string[]).includes(
        entrada.mimeType,
      )
    ) {
      throw new Error('Formato de áudio não suportado');
    }
    const texto = await this.chamar(
      [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: entrada.mimeType,
                data: entrada.audio.toString('base64'),
              },
            },
            { text: INSTRUCAO_AUDIO },
          ],
        },
      ],
      instrucaoDeSistema(dataReferencia, 'audio'),
      respostaExtracaoAudioJsonSchema,
    );
    const { gastos, transcricao } = interpretar(
      texto,
      respostaExtracaoAudioSchema,
    );
    return { gastos, textoOriginal: transcricao };
  }

  private async chamar(
    contents: ContentListUnion,
    systemInstruction: string,
    responseJsonSchema: unknown,
  ): Promise<string> {
    try {
      const resposta = await this.modelos.generateContent({
        model: this.modelo,
        contents,
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema,
        },
      });
      return resposta.text ?? '';
    } catch (erro) {
      throw indisponivelOuOriginal(erro);
    }
  }
}

function interpretar<T>(texto: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new RespostaInvalidaDaIaError('A IA devolveu um JSON inválido');
  }
  const resultado = schema.safeParse(json);
  if (!resultado.success) {
    throw new RespostaInvalidaDaIaError(
      'A resposta da IA não segue o schema esperado',
    );
  }
  return resultado.data;
}

/** 408/429/5xx, timeout (AbortError) e falha de rede são transitórios; o resto é bug nosso e sobe como está. */
function indisponivelOuOriginal(erro: unknown): unknown {
  const transitorio =
    (erro instanceof ApiError &&
      (erro.status === 408 || erro.status === 429 || erro.status >= 500)) ||
    (erro instanceof TypeError && erro.message === 'fetch failed') ||
    (erro instanceof Error &&
      (erro.name === 'AbortError' || erro.name === 'TimeoutError'));
  return transitorio
    ? new ProvedorIndisponivelError('Provedor de IA indisponível')
    : erro;
}
