import { ApiError, GoogleGenAI, type ContentListUnion } from '@google/genai';
import {
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type {
  ContextoDeInterpretacao,
  Correcao,
  EntradaMensagem,
  Interpretacao,
  InterpretadorDeMensagem,
  ItemParaCorrecao,
} from '../../application/ports/interpretador-de-mensagem.js';
import { z } from 'zod';
import {
  INSTRUCAO_AUDIO,
  instrucaoDeCorrecao,
  instrucaoDeSistema,
  mensagemDoUsuario,
  VERSAO_PROMPT_ATUAL,
  type VersaoPrompt,
} from './prompt.js';
import { CATEGORIAS } from '../../domain/categoria.js';
import { CATEGORIAS_ENTRADA } from '../../domain/categoria-entrada.js';
import {
  respostaCorrecaoAudioJsonSchema,
  respostaCorrecaoAudioSchema,
  respostaCorrecaoJsonSchema,
  respostaCorrecaoSchema,
  respostaInterpretacaoAudioJsonSchema,
  respostaInterpretacaoAudioJsonSchemaV6,
  respostaInterpretacaoAudioSchemaV6,
  respostaInterpretacaoJsonSchemaV6,
  respostaInterpretacaoSchemaV6,
  type RespostaCorrecao,
  type RespostaInterpretacaoV6,
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

/**
 * Limita custo e latência. Pior caso estimado ≈ 3.100 tokens: 10 gastos + 10 entradas
 * + 5 parcelamentos + transcrição de 2000 caracteres.
 */
export const MAX_TOKENS_SAIDA = 4096;

export function criarModelosGemini(apiKey: string): ModelosGemini {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: TIMEOUT_GEMINI_MS },
  }).models;
}

const SEM_CONTEXTO: ContextoDeInterpretacao = { cartoes: [] };

interface Formato {
  schema: z.ZodType<RespostaAtual>;
  audioSchema: z.ZodType<RespostaAtual & { transcricao: string }>;
  json: unknown;
  audioJson: unknown;
}

const FORMATO_ANTIGO: Formato = {
  schema: respostaInterpretacaoSchema,
  audioSchema: respostaInterpretacaoAudioSchema,
  json: respostaInterpretacaoJsonSchema,
  audioJson: respostaInterpretacaoAudioJsonSchema,
};
const FORMATO_V5: Formato = {
  ...FORMATO_ANTIGO,
  json: respostaInterpretacaoJsonSchemaV5,
  audioJson: respostaInterpretacaoAudioJsonSchemaV5,
};

/** v1–v5 usam o schema antigo; v6 o completo. O Record obriga cada versão nova a escolher. */
const FORMATOS: Record<VersaoPrompt, Formato> = {
  v1: FORMATO_ANTIGO,
  v2: FORMATO_ANTIGO,
  v3: FORMATO_ANTIGO,
  v4: FORMATO_ANTIGO,
  v5: FORMATO_V5,
  v6: {
    schema: respostaInterpretacaoSchemaV6,
    audioSchema: respostaInterpretacaoAudioSchemaV6,
    json: respostaInterpretacaoJsonSchemaV6,
    audioJson: respostaInterpretacaoAudioJsonSchemaV6,
  },
};

export class GeminiInterpretador implements InterpretadorDeMensagem {
  constructor(
    private readonly modelos: ModelosGemini,
    private readonly modelo: string,
    private readonly versao: VersaoPrompt = VERSAO_PROMPT_ATUAL,
  ) {}

  async interpretar(
    entrada: EntradaMensagem,
    dataReferencia: Date,
    contexto: ContextoDeInterpretacao = SEM_CONTEXTO,
  ): Promise<Interpretacao> {
    const f = FORMATOS[this.versao];
    const sistema = (tipo: 'texto' | 'audio') =>
      instrucaoDeSistema(dataReferencia, tipo, this.versao, contexto);
    if (entrada.tipo === 'texto') {
      const bruto = await this.chamar(
        mensagemDoUsuario(entrada.texto),
        sistema('texto'),
        f.json,
      );
      return paraInterpretacao(interpretar(bruto, f.schema), entrada.texto);
    }
    const bruto = await this.chamar(
      conteudoDeAudio(entrada),
      sistema('audio'),
      f.audioJson,
    );
    const { transcricao, ...resposta } = interpretar(bruto, f.audioSchema);
    return paraInterpretacao(resposta, transcricao);
  }

  async interpretarCorrecao(
    entrada: EntradaMensagem,
    itens: readonly ItemParaCorrecao[],
    dataReferencia: Date,
    contexto: ContextoDeInterpretacao = SEM_CONTEXTO,
  ): Promise<Correcao> {
    const sistema = (tipo: 'texto' | 'audio') =>
      instrucaoDeCorrecao(itens, dataReferencia, contexto, tipo);
    if (entrada.tipo === 'texto') {
      const bruto = await this.chamar(
        mensagemDoUsuario(entrada.texto),
        sistema('texto'),
        respostaCorrecaoJsonSchema,
      );
      return paraCorrecao(
        interpretar(bruto, respostaCorrecaoSchema),
        itens,
        entrada.texto,
      );
    }
    const bruto = await this.chamar(
      conteudoDeAudio(entrada),
      sistema('audio'),
      respostaCorrecaoAudioJsonSchema,
    );
    const { transcricao, ...resposta } = interpretar(
      bruto,
      respostaCorrecaoAudioSchema,
    );
    return paraCorrecao(resposta, itens, transcricao);
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

function conteudoDeAudio(entrada: {
  audio: Buffer;
  mimeType: string;
}): ContentListUnion {
  if (!MIMES_DE_AUDIO_SUPORTADOS.includes(entrada.mimeType)) {
    throw new Error('Formato de áudio não suportado');
  }
  return [
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
  ];
}

type RespostaAntiga = Pick<
  RespostaInterpretacao,
  'intencao' | 'gastos' | 'inicio' | 'fim'
>;
type RespostaAtual = RespostaInterpretacaoV6 | RespostaAntiga;

function invalida(motivo: string): RespostaInvalidaDaIaError {
  return new RespostaInvalidaDaIaError(motivo);
}

function paraInterpretacao(
  resposta: RespostaAtual,
  textoOriginal: string,
): Interpretacao {
  const { intencao, inicio, fim } = resposta;
  if (intencao === 'registrar') {
    if ('entradas' in resposta) {
      for (const p of resposta.parcelamentos) {
        if (p.parcelaAtual !== null && p.parcelaAtual > p.quantidade)
          throw invalida('parcelaAtual maior que a quantidade');
        if (p.totalReais === null && p.valorParcelaReais === null)
          throw invalida('parcelamento sem valor');
      }
      const { gastos, entradas, parcelamentos } = resposta;
      return { intencao, gastos, entradas, parcelamentos, textoOriginal };
    }
    return {
      intencao,
      gastos: resposta.gastos.map((g) => ({
        ...g,
        cartao: null,
        formaPagamento: null,
      })),
      entradas: [],
      parcelamentos: [],
      textoOriginal,
    };
  }
  if (intencao === 'listarUltimos') return { intencao, textoOriginal };
  if (intencao === 'informarFatura' || intencao === 'consultarFatura') {
    const fatura = 'fatura' in resposta ? resposta.fatura : null;
    const cartao = fatura?.cartao ?? null;
    const mes = fatura?.mes ?? null;
    if (intencao === 'consultarFatura')
      return { intencao, cartao, mes, textoOriginal };
    if (fatura?.valorReais == null)
      throw invalida('A IA não informou o valor da fatura');
    return {
      intencao,
      cartao,
      mes,
      valorReais: fatura.valorReais,
      textoOriginal,
    };
  }
  if (inicio === null || fim === null) {
    throw invalida('A IA não informou o período');
  }
  return { intencao, inicio, fim, textoOriginal };
}

function paraCorrecao(
  resposta: RespostaCorrecao,
  itens: readonly ItemParaCorrecao[],
  textoOriginal: string,
): Correcao {
  const tipos = new Map(itens.map((i) => [i.indice, i.tipo]));
  const existe = (i: number) => tipos.has(i);
  const alterados = resposta.alteracoes.map((a) => a.indice);
  if (
    new Set(alterados).size !== alterados.length ||
    new Set(resposta.remover).size !== resposta.remover.length ||
    alterados.some((i) => resposta.remover.includes(i))
  )
    throw invalida('Índices repetidos ou alterados e removidos ao mesmo tempo');
  if (!resposta.remover.every(existe))
    throw invalida('Índice de remoção fora da lista');
  const alteracoes = resposta.alteracoes.map((a) => {
    const tipo = tipos.get(a.indice);
    if (!tipo) throw invalida('Índice de alteração fora da lista');
    const permitidas: readonly string[] =
      tipo === 'gasto' ? CATEGORIAS : CATEGORIAS_ENTRADA;
    if (a.categoria !== null && !permitidas.includes(a.categoria))
      throw invalida('Categoria incompatível com o item');
    if (
      tipo === 'entrada' &&
      (a.cartao !== null || a.formaPagamento !== null || a.removerCartao)
    )
      throw invalida('Entrada não tem cartão');
    // remover cartão implica sem forma: o domínio exige cartão e forma juntos
    if (a.removerCartao && (a.cartao !== null || a.formaPagamento !== null))
      throw invalida('Alteração de cartão contraditória');
    return {
      indice: a.indice,
      ...(a.valorReais !== null && { valorReais: a.valorReais }),
      ...(a.categoria !== null && { categoria: a.categoria }),
      ...(a.descricao !== null && { descricao: a.descricao }),
      ...(a.data !== null && { data: a.data }),
      ...(a.removerCartao
        ? { cartao: null, formaPagamento: null }
        : {
            ...(a.cartao !== null && { cartao: a.cartao }),
            ...(a.formaPagamento !== null && {
              formaPagamento: a.formaPagamento,
            }),
          }),
    };
  });
  return {
    alteracoes,
    remover: resposta.remover,
    acrescentar: resposta.acrescentar,
    textoOriginal,
  };
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
