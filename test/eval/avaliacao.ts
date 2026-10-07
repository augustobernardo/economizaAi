import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { GastoExtraido } from '../../src/modules/gastos/application/ports/interpretador-de-mensagem.js';
import { CATEGORIAS } from '../../src/modules/gastos/domain/categoria.js';
import { Dinheiro } from '../../src/modules/gastos/domain/dinheiro.js';

export type Campo =
  'intencao' | 'quantidade' | 'valor' | 'categoria' | 'data' | 'descricao';
export const CAMPOS: readonly Campo[] = [
  'intencao',
  'quantidade',
  'valor',
  'categoria',
  'data',
  'descricao',
];

const casoSchema = z
  .object({
    id: z.string().min(1),
    texto: z.string().min(1),
    holdout: z.boolean(),
    esperado: z
      .object({
        intencao: z.enum(['registrar', 'exportar', 'resumir', 'listarUltimos']),
        gastos: z.array(
          z
            .object({
              centavos: z.number().int().positive(),
              categoria: z.enum(CATEGORIAS),
              data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              descricao: z.array(z.string().min(1)).min(1),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export type GastoEsperado = Caso['esperado']['gastos'][number];
export type Caso = z.infer<typeof casoSchema>;
export type Obtido = { intencao: string; gastos: GastoExtraido[] } | null; // null = a IA falhou
export interface Checagem {
  caso: string;
  campo: Campo;
  ok: boolean;
  esperado: string;
  obtido: string;
}

export function carregarCasos(): Caso[] {
  const bruto: unknown = JSON.parse(
    readFileSync(new URL('./casos.json', import.meta.url), 'utf8'),
  );
  return z.array(casoSchema).parse(bruto);
}

const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

function centavosDe(reais: number): number | null {
  try {
    return Dinheiro.deReais(reais).centavos;
  } catch {
    return null;
  }
}

type ObtidoItem = GastoExtraido & { c: number };

function acertos(e: GastoEsperado, o: ObtidoItem) {
  return {
    valor: o.c === e.centavos,
    categoria: o.categoria === e.categoria,
    data: o.dataGasto === e.data,
    descricao: e.descricao.some((p) =>
      normalizar(o.descricao).includes(normalizar(p)),
    ),
  };
}

const pontos = (e: GastoEsperado, o: ObtidoItem) =>
  Object.values(acertos(e, o)).filter(Boolean).length;

/** Pareamento guloso: cada esperado leva o obtido livre com mais campos certos. */
function parear(
  esperados: GastoEsperado[],
  obtidos: ObtidoItem[],
): ObtidoItem[] {
  const livres = [...obtidos];
  return esperados.map((e) => {
    let melhor = 0;
    livres.forEach((o, i) => {
      if (pontos(e, o) > pontos(e, livres[melhor]!)) melhor = i;
    });
    return livres.splice(melhor, 1)[0]!;
  });
}

export function compararCaso(caso: Caso, obtido: Obtido): Checagem[] {
  const out: Checagem[] = [];
  const add = (campo: Campo, ok: boolean, esperado: string, obt: string) =>
    out.push({
      caso: caso.id,
      campo,
      ok: obtido !== null && ok,
      esperado,
      obtido: obt,
    });
  const esperados = caso.esperado.gastos;
  const itens: ObtidoItem[] = (obtido?.gastos ?? []).map((o) => ({
    ...o,
    c: centavosDe(o.valorReais) ?? -1,
  }));
  const mesmaQtd = obtido !== null && itens.length === esperados.length;
  const pares = mesmaQtd ? parear(esperados, itens) : [];

  add(
    'intencao',
    obtido?.intencao === caso.esperado.intencao,
    caso.esperado.intencao,
    obtido?.intencao ?? 'falhou',
  );
  add(
    'quantidade',
    mesmaQtd,
    String(esperados.length),
    obtido ? String(itens.length) : 'falhou',
  );
  esperados.forEach((e, i) => {
    const o = pares[i];
    const a = o && acertos(e, o);
    const falta = obtido ? 'sem item' : 'falhou';
    add(
      'valor',
      a?.valor ?? false,
      String(e.centavos),
      o ? String(o.c) : falta,
    );
    add('categoria', a?.categoria ?? false, e.categoria, o?.categoria ?? falta);
    add('data', a?.data ?? false, e.data, o?.dataGasto ?? falta);
    add(
      'descricao',
      a?.descricao ?? false,
      e.descricao.join('|'),
      o?.descricao ?? falta,
    );
  });
  return out;
}

export function placar(
  checagens: Checagem[],
): Record<Campo, { acertos: number; total: number }> {
  const p = Object.fromEntries(
    CAMPOS.map((c) => [c, { acertos: 0, total: 0 }]),
  ) as Record<Campo, { acertos: number; total: number }>;
  for (const c of checagens) {
    p[c.campo].total++;
    if (c.ok) p[c.campo].acertos++;
  }
  return p;
}
