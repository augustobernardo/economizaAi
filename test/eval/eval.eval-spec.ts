import { setTimeout as esperar } from 'node:timers/promises';
import { describe, it } from 'vitest';
import { ProvedorIndisponivelError } from '../../src/modules/gastos/application/errors.js';
import {
  criarModelosGemini,
  GeminiInterpretador,
} from '../../src/modules/gastos/infrastructure/ia/gemini.interpretador.js';
import {
  VERSAO_PROMPT_ATUAL,
  VERSOES_PROMPT,
  type VersaoPrompt,
} from '../../src/modules/gastos/infrastructure/ia/prompt.js';
import {
  CAMPOS,
  carregarCasos,
  compararCaso,
  placar,
  type Checagem,
  type Obtido,
} from './avaliacao.js';

const REFERENCIA = new Date('2026-10-05T12:00:00-03:00');
const apiKey = process.env.GEMINI_API_KEY;
const modelo = process.env.GEMINI_MODEL;
const versao = (process.env.EVAL_PROMPT ?? VERSAO_PROMPT_ATUAL) as VersaoPrompt;
const conjunto = process.env.EVAL_CONJUNTO ?? 'treino';
const pausaBruta = Number(process.env.EVAL_PAUSA_MS ?? 4000);
const pausaMs =
  Number.isFinite(pausaBruta) && pausaBruta >= 0 ? pausaBruta : 4000;

function imprimir(titulo: string, checagens: Checagem[]) {
  const p = placar(checagens);
  console.log(`\n## ${titulo}\n`);
  console.table(
    Object.fromEntries(
      CAMPOS.map((c) => [
        c,
        `${p[c].acertos}/${p[c].total} (${p[c].total ? ((100 * p[c].acertos) / p[c].total).toFixed(1) : '-'}%)`,
      ]),
    ),
  );
}

describe.skipIf(!apiKey || !modelo)('avaliação da extração', () => {
  it(`prompt ${versao}, conjunto ${conjunto}`, async () => {
    if (!Object.hasOwn(VERSOES_PROMPT, versao))
      throw new Error(`EVAL_PROMPT desconhecido: ${versao}`);
    const ia = new GeminiInterpretador(
      criarModelosGemini(apiKey!),
      modelo!,
      versao,
    );
    const casos = carregarCasos().filter(
      (c) => conjunto === 'todos' || c.holdout === (conjunto === 'holdout'),
    );
    const holdouts = new Set(casos.filter((c) => c.holdout).map((c) => c.id));
    const checagens: Checagem[] = [];
    let rodados = 0;
    for (const caso of casos) {
      let obtido: Obtido = null;
      try {
        const r = await ia.interpretar(
          { tipo: 'texto', texto: caso.texto },
          REFERENCIA,
        );
        obtido = {
          intencao: r.intencao,
          gastos: r.intencao === 'registrar' ? r.gastos : [],
        };
      } catch (erro) {
        // Cota (429) ou indisponibilidade: parar para não queimar a cota do dia.
        if (erro instanceof ProvedorIndisponivelError) {
          console.warn(`Parado no caso ${caso.id}: provedor indisponível`);
          break;
        }
        // Só o nome do erro: nunca mensagem nem payload.
        console.warn(
          `${caso.id}: ${erro instanceof Error ? erro.name : typeof erro}`,
        );
      }
      checagens.push(...compararCaso(caso, obtido));
      rodados++;
      await esperar(pausaMs);
    }
    imprimir(
      `prompt ${versao} · ${conjunto} · ${rodados}/${casos.length} casos`,
      checagens,
    );
    if (conjunto === 'todos') {
      imprimir(
        'treino',
        checagens.filter((c) => !holdouts.has(c.caso)),
      );
      imprimir(
        'holdout',
        checagens.filter((c) => holdouts.has(c.caso)),
      );
    }
    for (const e of checagens.filter((c) => !c.ok))
      console.log(
        `✗ ${e.caso}${holdouts.has(e.caso) ? ' [holdout]' : ''} · ${e.campo}: esperado ${e.esperado} · obtido ${e.obtido}`,
      );
  });
});
