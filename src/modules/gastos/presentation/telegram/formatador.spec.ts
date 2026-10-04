import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
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
import { MAX_BYTES_AUDIO } from '../limites.js';
import { DownloadFalhouError } from './download.js';
import {
  comTranscricao,
  formatarResumo,
  formatarUltimos,
  legendaExportacao,
  MENSAGEM_AUDIO_GRANDE,
  formatarRegistro,
  formatarRegistroDeAudio,
  formatarSemGastoNoAudio,
  MENSAGEM_AUDIO_LONGO,
  MENSAGEM_NAO_SUPORTADO,
  mensagemDeErro,
  TEXTO_AJUDA,
} from './formatador.js';

describe('formatarRegistro', () => {
  it('formata dois gastos com total, acento e data dd/MM', () => {
    const texto = formatarRegistro([
      umGasto()
        .comValor(32.5)
        .comDescricao('Uber')
        .comCategoria('transporte')
        .comData('2026-06-01')
        .build(),
      umGasto()
        .comValor(18)
        .comDescricao('Açaí')
        .comCategoria('alimentacao')
        .comData('2026-06-01')
        .build(),
    ]);

    expect(texto).toBe(
      [
        '✅ 2 gastos registrados',
        '• R$ 32,50 — Uber (transporte) — 01/06',
        '• R$ 18,00 — Açaí (alimentação) — 01/06',
        'Total: R$ 50,50',
      ].join('\n'),
    );
  });

  it('usa singular para um gasto', () => {
    const texto = formatarRegistro([umGasto().comValor(10).build()]);
    expect(texto.split('\n')[0]).toBe('✅ 1 gasto registrado');
  });

  it.each([
    ['saude', 'saúde'],
    ['educacao', 'educação'],
    ['vestuario', 'vestuário'],
    ['mercado', 'mercado'],
  ] as const)('rótulo de %s é %s', (categoria, rotulo) => {
    const texto = formatarRegistro([umGasto().comCategoria(categoria).build()]);
    expect(texto).toContain(`(${rotulo})`);
  });
});

describe('mensagemDeErro', () => {
  it.each([
    [
      new NenhumGastoEncontradoError('x'),
      'Não encontrei nenhum gasto. Exemplo: "gastei 25 no almoço"',
    ],
    [
      new ProvedorIndisponivelError('x'),
      'A IA está indisponível agora. Tente de novo em instantes.',
    ],
    [
      new RespostaInvalidaDaIaError('x'),
      'Não consegui entender. Pode reformular?',
    ],
    [
      new ValorAcimaDoTetoError('x'),
      'Valor acima do limite de R$ 50.000,00 por gasto.',
    ],
    [new ValorInvalidoError('x'), 'Não consegui entender o valor.'],
    [new DataFuturaError('x'), 'A data do gasto não pode ser no futuro.'],
    [new DataForaDaJanelaError('x'), 'Só registro gastos de até 1 ano atrás.'],
    [new DataInvalidaError('x'), 'Não consegui entender a data.'],
    [new DescricaoVaziaError('x'), 'Faltou dizer com o que foi o gasto.'],
    [new Error('segredo interno'), 'Erro inesperado. Tente de novo.'],
    ['não é Error', 'Erro inesperado. Tente de novo.'],
  ])('%o → mensagem amigável', (erro, esperado) => {
    expect(mensagemDeErro(erro)).toBe(esperado);
  });
});

describe('áudio', () => {
  it('formatarRegistroDeAudio mostra a transcrição antes da lista', () => {
    const texto = formatarRegistroDeAudio('gastei 10 no mercado', [
      umGasto().comValor(10).build(),
    ]);
    expect(texto.split('\n').slice(0, 3)).toEqual([
      '🎙️ "gastei 10 no mercado"',
      '',
      '✅ 1 gasto registrado',
    ]);
  });

  it('formatarSemGastoNoAudio mostra o que foi ouvido', () => {
    expect(formatarSemGastoNoAudio('bom dia')).toBe(
      '🎙️ Ouvi: "bom dia"\nNão encontrei nenhum gasto.',
    );
  });

  it('DownloadFalhouError → mensagem própria', () => {
    expect(mensagemDeErro(new DownloadFalhouError())).toBe(
      'Não consegui baixar o áudio. Tente de novo.',
    );
  });

  it('mensagens de limite e de tipo não suportado', () => {
    expect(MENSAGEM_AUDIO_LONGO).toBe('Áudio muito longo (máximo de 60 s).');
    expect(MENSAGEM_NAO_SUPORTADO).toBe(
      'Por enquanto só entendo mensagens de texto e de voz.',
    );
    expect(TEXTO_AJUDA).toMatch(/áudio|voz/i);
  });
});

const HOJE = new Date('2026-10-04T15:00:00Z');
const P_MES = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');

describe('formatadores da etapa 10', () => {
  it('resumo', () => {
    const gastos = [
      umGasto()
        .comValor(30)
        .comCategoria('alimentacao')
        .comDescricao('Almoço')
        .comData('2026-08-05')
        .em(HOJE)
        .build(),
      umGasto()
        .comValor(70)
        .comCategoria('moradia')
        .comDescricao('Luz')
        .comData('2026-08-10')
        .em(HOJE)
        .build(),
    ];
    expect(formatarResumo(P_MES, resumir(gastos))).toBe(
      [
        '📊 Resumo — agosto de 2026',
        'Total: R$ 100,00 (2 gastos)',
        '• moradia: R$ 70,00 (70%)',
        '• alimentação: R$ 30,00 (30%)',
        'Maior gasto: R$ 70,00 — Luz (moradia) — 10/08',
      ].join('\n'),
    );
  });

  it('últimos', () => {
    const g = umGasto()
      .comValor(32.5)
      .comDescricao('Uber')
      .comCategoria('transporte')
      .comData('2026-10-04')
      .em(HOJE)
      .build();
    expect(formatarUltimos([g])).toBe(
      '🧾 Último gasto\n• 04/10 — R$ 32,50 — Uber (transporte)',
    );
  });

  it('últimos no plural', () => {
    expect(
      formatarUltimos([umGasto().build(), umGasto().build()]).split('\n')[0],
    ).toBe('🧾 Últimos 2 gastos');
  });

  it('legenda da exportação', () => {
    expect(legendaExportacao(P_MES, 12)).toBe('📁 12 gastos — agosto de 2026');
    expect(legendaExportacao(P_MES, 1)).toBe('📁 1 gasto — agosto de 2026');
  });

  it.each([
    [
      Periodo.criar('2026-10-04', '2026-10-04', '2026-10-04'),
      'Nenhum gasto encontrado na data informada (04/10/2026).',
    ],
    [P_MES, 'Nenhum gasto encontrado no mês informado (agosto de 2026).'],
    [
      Periodo.criar('2026-09-01', '2026-09-15', '2026-10-04'),
      'Nenhum gasto encontrado no intervalo informado (01/09/2026 a 15/09/2026).',
    ],
  ])('período vazio %#', (periodo, esperado) => {
    expect(mensagemDeErro(new NenhumGastoNoPeriodoError(periodo))).toBe(
      esperado,
    );
  });

  it.each([
    [new PeriodoFuturoError('x'), 'O período informado está no futuro.'],
    [new PeriodoInvertidoError('x'), 'A data inicial é depois da data final.'],
    [new PeriodoLongoDemaisError('x'), 'O intervalo máximo é de 1 ano.'],
    [
      new NenhumGastoRegistradoError('x'),
      'Você ainda não registrou nenhum gasto.',
    ],
  ])('%o', (erro, esperado) => {
    expect(mensagemDeErro(erro)).toBe(esperado);
  });

  it('ajuda lista os comandos', () => {
    for (const c of ['/exportar', '/resumo', '/ultimos'])
      expect(TEXTO_AJUDA).toContain(c);
  });

  it('comTranscricao', () => {
    expect(comTranscricao('oi', 'X')).toBe('🎙️ "oi"\n\nX');
  });

  it('transcrição vazia omite a linha do microfone', () => {
    expect(comTranscricao('', 'X')).toBe('X');
    const gastos = [umGasto().build()];
    expect(formatarRegistroDeAudio('', gastos)).toBe(formatarRegistro(gastos));
  });

  it('MENSAGEM_AUDIO_GRANDE deriva de MAX_BYTES_AUDIO', () => {
    expect(MENSAGEM_AUDIO_GRANDE).toBe(
      `Áudio muito grande (máximo de ${MAX_BYTES_AUDIO / 1_048_576} MB).`,
    );
  });
});
