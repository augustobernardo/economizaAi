import { ApiError, GoogleGenAI, type ContentListUnion } from '@google/genai';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type {
  EntradaMensagem,
  Interpretacao,
  InterpretadorDeMensagem,
} from '../../application/ports/interpretador-de-mensagem.js';
import { z } from 'zod';
import {
  INSTRUCAO_AUDIO,
  instrucaoDeSistema,
  mensagemDoUsuario,
  VERSAO_PROMPT_ATUAL,
  type VersaoPrompt,
} from './prompt.js';
import {
  respostaInterpretacaoAudioJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV5,
  respostaInterpretacaoAudioSchema,
  respostaInterpretacaoJsonSchema,
  respostaInterpretacaoJsonSchemaV5,
  respostaInterpretacaoSchema,
  type RespostaInterpretacao,
} from './schema.js';

export type ModelosGemini = Pick<GoogleGenAI['models'], 'generateContent'>;

const MIMES_DE_AUDIO_SUPORTADOS: readonly string[] = ['audio/ogg'];

export const TIMEOUT_GEMINI_MS = 20_000;

/** Limita custo e latência; folga para transcrição de até 2000 caracteres + 10 gastos. */
export const MAX_TOKENS_SAIDA = 2048;

export function criarModelosGemini(apiKey: string): ModelosGemini {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: TIMEOUT_GEMINI_MS },
  }).models;
}

export class GeminiInterpretador implements InterpretadorDeMensagem {
  constructor(
    private readonly modelos: ModelosGemini,
    private readonly modelo: string,
    private readonly versao: VersaoPrompt = VERSAO_PROMPT_ATUAL,
  ) {}

  interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
  ): Promise<Interpretacao> {
    return entrada.tipo === 'texto'
      ? this.interpretarTexto(entrada.texto, dataReferencia)
      : this.interpretarAudio(entrada.audio, entrada.mimeType, dataReferencia);
  }

  private async interpretarTexto(
    texto: string,
    dataReferencia: Date,
  ): Promise<Interpretacao> {
    const bruto = await this.chamar(
      mensagemDoUsuario(texto),
      instrucaoDeSistema(dataReferencia, 'texto', this.versao),
      this.versao === 'v5'
        ? respostaInterpretacaoJsonSchemaV5
        : respostaInterpretacaoJsonSchema,
    );
    return paraInterpretacao(
      interpretar(bruto, respostaInterpretacaoSchema),
      texto,
    );
  }

  private async interpretarAudio(
    audio: Buffer,
    mimeType: string,
    dataReferencia: Date,
  ): Promise<Interpretacao> {
    if (!MIMES_DE_AUDIO_SUPORTADOS.includes(mimeType)) {
      throw new Error('Formato de áudio não suportado');
    }
    const bruto = await this.chamar(
      [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audio.toString('base64') } },
            { text: INSTRUCAO_AUDIO },
          ],
        },
      ],
      instrucaoDeSistema(dataReferencia, 'audio', this.versao),
      this.versao === 'v5'
        ? respostaInterpretacaoAudioJsonSchemaV5
        : respostaInterpretacaoAudioJsonSchema,
    );
    const { transcricao, ...resposta } = interpretar(
      bruto,
      respostaInterpretacaoAudioSchema,
    );
    return paraInterpretacao(resposta, transcricao);
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
          maxOutputTokens: MAX_TOKENS_SAIDA,
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

function paraInterpretacao(
  { intencao, gastos, inicio, fim }: RespostaInterpretacao,
  textoOriginal: string,
): Interpretacao {
  if (intencao === 'registrar') return { intencao, gastos, textoOriginal };
  if (intencao === 'listarUltimos') return { intencao, textoOriginal };
  if (inicio === null || fim === null) {
    throw new RespostaInvalidaDaIaError('A IA não informou o período');
  }
  return { intencao, inicio, fim, textoOriginal };
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
