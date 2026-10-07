import { describe, expect, it } from 'vitest';
import {
  EXEMPLOS_FEW_SHOT,
  VERSOES_PROMPT,
} from '../../src/modules/gastos/infrastructure/ia/prompt.js';
import {
  respostaInterpretacaoAudioJsonSchemaV5,
  respostaInterpretacaoJsonSchemaV5,
} from '../../src/modules/gastos/infrastructure/ia/schema.js';
import { carregarCasos, compararCaso, placar, type Caso } from './avaliacao.js';

const caso: Caso = {
  id: 't',
  texto: 'x',
  holdout: false,
  esperado: {
    intencao: 'registrar',
    gastos: [
      {
        centavos: 1600,
        categoria: 'alimentacao',
        data: '2026-10-05',
        descricao: ['cafe'],
      },
      {
        centavos: 500,
        categoria: 'transporte',
        data: '2026-10-04',
        descricao: ['onibus'],
      },
    ],
  },
};

/** Tudo que vai ao modelo: prompts de todas as versões e o JSON Schema com descrições (v5). */
function textosEnviadosAoModelo(): string[] {
  const ref = new Date('2026-10-05T15:00:00Z');
  return [
    ...Object.values(VERSOES_PROMPT).flatMap((v) => [
      v(ref, 'texto'),
      v(ref, 'audio'),
    ]),
    JSON.stringify(respostaInterpretacaoJsonSchemaV5),
    JSON.stringify(respostaInterpretacaoAudioJsonSchemaV5),
  ];
}

const normalizarTexto = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('compararCaso', () => {
  it('tudo certo, em qualquer ordem, com acento na descrição', () => {
    const r = compararCaso(caso, {
      intencao: 'registrar',
      gastos: [
        {
          valorReais: 5,
          categoria: 'transporte',
          descricao: 'Ônibus',
          dataGasto: '2026-10-04',
        },
        {
          valorReais: 16,
          categoria: 'alimentacao',
          descricao: '2 cafés',
          dataGasto: '2026-10-05',
        },
      ],
    });
    expect(r.every((c) => c.ok)).toBe(true);
    expect(r).toHaveLength(2 + 2 * 4);
  });
  it('quantidade diferente derruba todos os campos dos itens', () => {
    const r = compararCaso(caso, { intencao: 'registrar', gastos: [] });
    expect(r.filter((c) => c.ok).map((c) => c.campo)).toEqual(['intencao']);
  });
  it('IA falhou (null) → tudo errado, sem lançar', () => {
    expect(compararCaso(caso, null).some((c) => c.ok)).toBe(false);
  });
  it('valor por centavos exatos (16.0 vs 15.99)', () => {
    const r = compararCaso(
      {
        ...caso,
        esperado: { ...caso.esperado, gastos: [caso.esperado.gastos[0]!] },
      },
      {
        intencao: 'registrar',
        gastos: [
          {
            valorReais: 15.99,
            categoria: 'alimentacao',
            descricao: 'café',
            dataGasto: '2026-10-05',
          },
        ],
      },
    );
    expect(r.find((c) => c.campo === 'valor')!.ok).toBe(false);
  });
});

describe('pareamento', () => {
  const g = (
    centavos: number,
    categoria: 'mercado' | 'lazer' | 'saude',
    d: string,
  ) => ({
    centavos,
    categoria,
    data: '2026-10-05',
    descricao: [d],
  });
  const tres: Caso = {
    ...caso,
    esperado: {
      intencao: 'registrar',
      gastos: [
        g(1000, 'mercado', 'feira'),
        g(2000, 'lazer', 'cinema'),
        g(3000, 'saude', 'remedio'),
      ],
    },
  };
  it('um valor errado derruba só o campo valor daquele item', () => {
    const r = compararCaso(tres, {
      intencao: 'registrar',
      gastos: [
        {
          valorReais: 10,
          categoria: 'mercado',
          descricao: 'feira',
          dataGasto: '2026-10-05',
        },
        {
          valorReais: 21,
          categoria: 'lazer',
          descricao: 'cinema',
          dataGasto: '2026-10-05',
        },
        {
          valorReais: 30,
          categoria: 'saude',
          descricao: 'remédio',
          dataGasto: '2026-10-05',
        },
      ],
    });
    expect(r.filter((c) => !c.ok).map((c) => c.campo)).toEqual(['valor']);
  });
});

describe('placar', () => {
  it('conta acertos e total por campo', () => {
    const p = placar(compararCaso(caso, null));
    expect(p.intencao).toEqual({ acertos: 0, total: 1 });
    expect(p.valor).toEqual({ acertos: 0, total: 2 });
  });
});

describe('casos.json', () => {
  const casos = carregarCasos();
  it('tem ao menos 40 casos com ids únicos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(40);
    expect(new Set(casos.map((c) => c.id)).size).toBe(casos.length);
  });
  it('25% (±1) é holdout', () => {
    const h = casos.filter((c) => c.holdout).length;
    expect(Math.abs(h - casos.length / 4)).toBeLessThanOrEqual(1);
  });
  it('nenhum texto de holdout aparece em nenhuma versão do prompt', () => {
    const prompts = textosEnviadosAoModelo().map(normalizarTexto);
    for (const c of casos.filter((c) => c.holdout)) {
      const palavras = normalizarTexto(c.texto).split(' ');
      const janelas =
        palavras.length < 4
          ? [palavras.join(' ')]
          : palavras
              .slice(0, palavras.length - 3)
              .map((_, i) => palavras.slice(i, i + 4).join(' '));
      for (const p of prompts)
        for (const j of janelas) expect(p, `${c.id}: "${j}"`).not.toContain(j);
    }
  });
});

describe('EXEMPLOS_FEW_SHOT', () => {
  it('só usa textos de casos de treino (holdout: false)', () => {
    const treino = new Set(
      carregarCasos()
        .filter((c) => !c.holdout)
        .map((c) => c.texto),
    );
    for (const { texto } of EXEMPLOS_FEW_SHOT) expect(treino).toContain(texto);
  });
});
