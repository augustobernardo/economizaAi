import { ApiError, GoogleGenAI } from '@google/genai';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type {
  EntradaExtracao,
  ExtratorDeGastos,
  ResultadoExtracao,
} from '../../application/ports/extrator-de-gastos.js';
import { instrucaoDeSistema, mensagemDoUsuario } from './prompt.js';
import {
  respostaExtracaoJsonSchema,
  respostaExtracaoSchema,
} from './schema.js';

export type ModelosGemini = Pick<GoogleGenAI['models'], 'generateContent'>;

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
    if (entrada.tipo !== 'texto') {
      throw new Error('Áudio não suportado por este extrator');
    }

    const texto = await this.chamar(entrada.texto, dataReferencia);
    return { gastos: interpretar(texto).gastos, textoOriginal: entrada.texto };
  }

  private async chamar(texto: string, dataReferencia: Date): Promise<string> {
    try {
      const resposta = await this.modelos.generateContent({
        model: this.modelo,
        contents: mensagemDoUsuario(texto),
        config: {
          systemInstruction: instrucaoDeSistema(dataReferencia),
          temperature: 0,
          responseMimeType: 'application/json',
          responseJsonSchema: respostaExtracaoJsonSchema,
        },
      });
      return resposta.text ?? '';
    } catch (erro) {
      throw indisponivelOuOriginal(erro);
    }
  }
}

function interpretar(texto: string) {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new RespostaInvalidaDaIaError('A IA devolveu um JSON inválido');
  }
  const resultado = respostaExtracaoSchema.safeParse(json);
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
