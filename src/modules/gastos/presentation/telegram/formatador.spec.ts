import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type { Categoria } from '../../domain/categoria.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
  ValorAcimaDoTetoError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import { Periodo } from '../../domain/periodo.js';
import { resumir } from '../../domain/resumo.js';
import { BYTES_POR_MB, MAX_BYTES_AUDIO } from '../limites.js';
import { DownloadFalhouError } from './download.js';
import {
  COMANDOS,
  comTranscricao,
  dataRelativa,
  formatarDesfeito,
  formatarRegistro,
  formatarResumo,
  formatarSemGastoNoAudio,
  formatarUltimos,
  legendaExportacao,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_COMANDO_DESCONHECIDO,
  MENSAGEM_ESCOLHER_MES_EXPORTAR,
  MENSAGEM_NAO_SUPORTADO,
  MENSAGEM_NENHUM_GASTO,
  MENSAGEM_RATE_LIMIT,
  MENSAGEM_TEXTO_LONGO,
  mensagemDeErro,
  TEXTO_AJUDA,
  TEXTO_START,
} from './formatador.js';

const HOJE = '2026-10-05';
const g = (
  valor: number,
  categoria: Categoria,
  descricao: string,
  data = HOJE,
) =>
  umGasto()
    .em(new Date('2026-10-05T15:00:00Z'))
    .comValor(valor)
    .comCategoria(categoria)
    .comDescricao(descricao)
    .comData(data)
    .build();

describe('dataRelativa', () => {
  it('hoje, ontem, outro dia', () => {
    expect(dataRelativa('2026-10-05', HOJE)).toBe('Hoje, 05/10');
    expect(dataRelativa('2026-10-04', HOJE)).toBe('Ontem, 04/10');
    expect(dataRelativa('2026-10-03', HOJE)).toBe('03/10');
  });
  it('ontem na virada de ano', () => {
    expect(dataRelativa('2025-12-31', '2026-01-01')).toBe('Ontem, 31/12');
  });
});

describe('formatarRegistro', () => {
  it('um gasto: linhas separadas', () => {
    expect(
      formatarRegistro([g(50, 'mercado', 'Compras da semana')], HOJE),
    ).toBe(
      [
        '✅ <b>Gasto registrado!</b>',
        '',
        '🛒 Mercado',
        '💰 R$ 50,00',
        '📝 Compras da semana',
        '📅 Hoje, 05/10',
      ].join('\n'),
    );
  });
  it('vários gastos: linha recuada e total', () => {
    expect(
      formatarRegistro(
        [
          g(32.5, 'transporte', 'Uber', '2026-10-04'),
          g(18, 'alimentacao', 'Açaí', '2026-10-04'),
        ],
        HOJE,
      ),
    ).toBe(
      [
        '✅ <b>2 gastos registrados!</b>',
        '',
        '🚗 Transporte: R$ 32,50',
        '     Uber · Ontem, 04/10',
        '🍔 Alimentação: R$ 18,00',
        '     Açaí · Ontem, 04/10',
        '',
        '💵 <b>Total: R$ 50,50</b>',
      ].join('\n'),
    );
  });
  it('total com milhar', () => {
    expect(
      formatarRegistro(
        [g(1000, 'moradia', 'Aluguel'), g(234.56, 'mercado', 'Feira')],
        HOJE,
      ),
    ).toContain('💵 <b>Total: R$ 1.234,56</b>');
  });
  it('descrição com <b> e & sai escapada', () => {
    const saida = formatarRegistro([g(10, 'outros', '<b>x</b> & y')], HOJE);
    expect(saida).toContain('📝 &lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});

describe('áudio', () => {
  it('prefixa com 🎙️ e a transcrição escapada entre aspas', () => {
    expect(comTranscricao('gastei <50>', 'X')).toBe(
      '🎙️ Entendi: "gastei &lt;50&gt;"\n\nX',
    );
  });
  it('corte não parte emoji ao meio', () => {
    const saida = comTranscricao('a'.repeat(498) + '😀'.repeat(5), 'X');
    expect(saida).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
    expect(saida).toContain('😀…');
  });
  it('transcrição vazia não gera prefixo', () => {
    expect(comTranscricao('', 'X')).toBe('X');
  });
  it('transcrição longa é cortada em 500 caracteres antes do escape', () => {
    const saida = comTranscricao('&'.repeat(2000), 'X');
    expect(saida).toContain(`"${'&amp;'.repeat(499)}…"`);
  });
});

describe('formatarResumo', () => {
  it('layout do mês', () => {
    const periodo = Periodo.criar('2026-10-01', '2026-10-31', '2026-10-31');
    const gastos = [
      g(520, 'mercado', 'Feira', '2026-10-03'),
      g(310, 'alimentacao', 'Almoço', '2026-10-02'),
    ];
    const saida = formatarResumo(periodo, resumir(gastos));
    expect(saida.split('\n')[0]).toBe('📊 <b>Resumo de outubro/2026</b>');
    expect(saida).toContain('💵 Total: R$ 830,00 · 2 registros');
    expect(saida).toContain('🛒 Mercado: R$ 520,00 (');
    expect(saida).toContain('🏆 Maior gasto: R$ 520,00 · Mercado · 03/10');
  });
});

describe('formatarUltimos', () => {
  it('uma linha por gasto, com data relativa', () => {
    expect(
      formatarUltimos([g(32.5, 'transporte', 'Uber', '2026-10-04')], HOJE),
    ).toBe('🧾 <b>Último gasto</b>\n\n🚗 Ontem, 04/10 · R$ 32,50 · Uber');
  });
  it('plural no título', () => {
    expect(
      formatarUltimos([g(1, 'outros', 'a'), g(2, 'outros', 'b')], HOJE).split(
        '\n',
      )[0],
    ).toBe('🧾 <b>Últimos 2 gastos</b>');
  });
});

describe('mensagens avulsas', () => {
  const P_MES = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
  it('legenda da exportação', () => {
    expect(legendaExportacao(P_MES, 12)).toBe(
      '📎 Aqui está o seu arquivo de <b>agosto/2026</b> (12 gastos).',
    );
  });
  it('desfeito escapa o texto original', () => {
    expect(formatarDesfeito(' <b>x</b> ')).toBe(
      '&lt;b&gt;x&lt;/b&gt;\n\n↩️ <b>Pronto, desfiz o registro.</b>',
    );
    expect(formatarDesfeito('')).toBe('↩️ <b>Pronto, desfiz o registro.</b>');
  });
  it('limites derivam das constantes', () => {
    expect(MENSAGEM_AUDIO_GRANDE).toContain(
      `${MAX_BYTES_AUDIO / BYTES_POR_MB} MB`,
    );
    expect(TEXTO_AJUDA).toMatch(/\/resumo/);
    expect(COMANDOS.map((c) => c.command)).toEqual([
      'start',
      'ajuda',
      'resumo',
      'ultimos',
      'exportar',
    ]);
  });
});

describe('mensagemDeErro', () => {
  it.each([
    [
      new Error('segredo interno'),
      '🛠️ Algo deu errado do meu lado. Já registrei o problema.',
    ],
    ['não é Error', '🛠️ Algo deu errado do meu lado. Já registrei o problema.'],
    [
      new DataFuturaError('x'),
      '📅 Essa data não parece certa: o gasto não pode ser no futuro.',
    ],
    [
      new DownloadFalhouError(),
      '🎧 Não consegui baixar o áudio. Tente de novo.',
    ],
  ])('%o → mensagem amigável', (erro, esperado) => {
    expect(mensagemDeErro(erro)).toBe(esperado);
  });

  it.each([
    [
      Periodo.criar('2026-10-04', '2026-10-04', '2026-10-04'),
      'na data informada (<b>04/10/2026</b>)',
    ],
    [
      Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04'),
      'em <b>agosto/2026</b>',
    ],
    [
      Periodo.criar('2026-09-01', '2026-09-15', '2026-10-04'),
      'no intervalo informado (<b>01/09/2026 a 15/09/2026</b>)',
    ],
  ])('período vazio %#', (periodo, trecho) => {
    expect(mensagemDeErro(new NenhumGastoNoPeriodoError(periodo))).toContain(
      trecho,
    );
  });
});

const PERIODO = Periodo.criar('2026-10-01', '2026-10-31', '2026-10-31');
const ERROS_CONHECIDOS = [
  new NenhumGastoEncontradoError('x'),
  new ProvedorIndisponivelError('x'),
  new RespostaInvalidaDaIaError('x'),
  new ValorAcimaDoTetoError('x'),
  new ValorInvalidoError('x'),
  new DataFuturaError('x'),
  new DataForaDaJanelaError('x'),
  new DataInvalidaError('x'),
  new DescricaoVaziaError('x'),
  new PeriodoFuturoError('x'),
  new PeriodoInvertidoError('x'),
  new PeriodoLongoDemaisError('x'),
  new NenhumGastoRegistradoError('x'),
  new DownloadFalhouError(),
];

describe('todas as mensagens', () => {
  const saidas: Record<string, string> = {
    start: TEXTO_START,
    ajuda: TEXTO_AJUDA,
    registro: formatarRegistro([g(10, 'lazer', 'Cinema')], HOJE),
    varios: formatarRegistro([g(10, 'lazer', 'a'), g(5, 'saude', 'b')], HOJE),
    audio: comTranscricao('oi', 'x'),
    semGastoAudio: formatarSemGastoNoAudio('oi'),
    resumo: formatarResumo(PERIODO, resumir([g(10, 'lazer', 'a')])),
    ultimos: formatarUltimos([g(10, 'lazer', 'a')], HOJE),
    legenda: legendaExportacao(PERIODO, 3),
    desfeito: formatarDesfeito('x'),
    nenhum: MENSAGEM_NENHUM_GASTO,
    textoLongo: MENSAGEM_TEXTO_LONGO,
    audioLongo: MENSAGEM_AUDIO_LONGO,
    audioGrande: MENSAGEM_AUDIO_GRANDE,
    naoSuportado: MENSAGEM_NAO_SUPORTADO,
    desconhecido: MENSAGEM_COMANDO_DESCONHECIDO,
    rateLimit: MENSAGEM_RATE_LIMIT,
    escolherMes: MENSAGEM_ESCOLHER_MES_EXPORTAR,
    inesperado: mensagemDeErro(new Error('x')),
    periodoVazio: mensagemDeErro(new NenhumGastoNoPeriodoError(PERIODO)),
    ...Object.fromEntries(
      ERROS_CONHECIDOS.map((e) => [e.name, mensagemDeErro(e)]),
    ),
  };
  it.each(Object.entries(saidas))(
    '%s tem emoji e só tags permitidas',
    (_, html) => {
      expect(html).toMatch(/\p{Extended_Pictographic}/u);
      for (const [, tag] of html.matchAll(/<\/?([a-z]+)[^>]*>/g))
        expect([
          'b',
          'i',
          'u',
          's',
          'code',
          'pre',
          'a',
          'blockquote',
        ]).toContain(tag);
    },
  );
  // Regra do dono: o Eco não usa travessão nem meia-risca.
  it.each(Object.entries(saidas))('%s não usa travessão', (_, html) => {
    expect(html).not.toMatch(/[—–]/);
  });
  it('comandos do menu não usam travessão', () => {
    for (const c of COMANDOS) expect(c.description).not.toMatch(/[—–]/);
  });
  it('nenhuma mensagem de erro expõe nome de provedor', () => {
    for (const e of ERROS_CONHECIDOS)
      expect(mensagemDeErro(e)).not.toMatch(/gemini|groq/i);
  });
});
