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
  IntervaloDeFaturaInvalidoError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
  ValorAcimaDoTetoError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import type { Gasto } from '../../domain/gasto.js';
import { Periodo } from '../../domain/periodo.js';
import {
  dadosComGastos,
  dadosDoPeriodo,
} from '../../../../../test/builders/dados-do-periodo.builder.js';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import { Cartao } from '../../domain/cartao.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { comporFatura, FaturaInformada } from '../../domain/fatura.js';
import * as erros from '../../application/errors.js';
import { BYTES_POR_MB, MAX_BYTES_AUDIO } from '../limites.js';
import { DownloadFalhouError } from './download.js';
import {
  COMANDOS,
  comDesfecho,
  comTranscricao,
  formatarCartaoCadastrado,
  formatarCartaoRemovido,
  formatarDesfechoDaEdicao,
  formatarEdicao,
  POPUP_OPCAO_INVALIDA,
  POPUP_PARCELAMENTO_INEXISTENTE,
  POPUP_PENDENCIA_EXPIRADA,
  formatarFaturas,
  formatarPedidoDeRemocao,
  MENSAGEM_EDICAO_APLICADA,
  MENSAGEM_EDICAO_CANCELADA,
  MENSAGEM_PARCELAMENTO_MANTIDO,
  MENSAGEM_PARCELAMENTO_REMOVIDO,
  MENSAGEM_PENDENCIA_EXPIRADA,
  MENSAGEM_USO_CARTOES,
  MENSAGEM_USO_FATURA,
  dataRelativa,
  formatarDesfeito,
  barraDeProgresso,
  formatarCartoes,
  formatarEscolha,
  formatarFatura,
  formatarFaturaInformada,
  formatarParcelamentos,
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
import { html } from './html.js';

const HOJE = '2026-10-05';
const reg = (gastos: Gasto[]) => ({
  gastos,
  entradas: [],
  parcelamentos: [],
  cartoes: new Map<string, Cartao>(),
  avisos: [],
});
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
      formatarRegistro(reg([g(50, 'mercado', 'Compras da semana')]), HOJE),
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
        reg([
          g(32.5, 'transporte', 'Uber', '2026-10-04'),
          g(18, 'alimentacao', 'Açaí', '2026-10-04'),
        ]),
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
        reg([g(1000, 'moradia', 'Aluguel'), g(234.56, 'mercado', 'Feira')]),
        HOJE,
      ),
    ).toContain('💵 <b>Total: R$ 1.234,56</b>');
  });
  it('descrição com <b> e & sai escapada', () => {
    const saida = formatarRegistro(
      reg([g(10, 'outros', '<b>x</b> & y')]),
      HOJE,
    );
    expect(saida).toContain('📝 &lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});

describe('áudio', () => {
  it('prefixa com 🎙️ e a transcrição escapada entre aspas', () => {
    expect(comTranscricao('gastei <50>', html`X`)).toBe(
      '🎙️ Entendi: "gastei &lt;50&gt;"\n\nX',
    );
  });
  it('corte não parte emoji ao meio', () => {
    const saida = comTranscricao('a'.repeat(498) + '😀'.repeat(5), html`X`);
    expect(saida).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
    expect(saida).toContain('😀…');
  });
  it('transcrição vazia não gera prefixo', () => {
    expect(comTranscricao('', html`X`)).toBe('X');
  });
  it('transcrição longa é cortada em 500 caracteres antes do escape', () => {
    const saida = comTranscricao('&'.repeat(2000), html`X`);
    expect(saida).toContain(`"${'&amp;'.repeat(499)}…"`);
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
      'cartoes',
      'fatura',
      'parcelamentos',
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
    [
      new IntervaloDeFaturaInvalidoError('x'),
      '📅 O vencimento precisa ser de 1 a 20 dias depois do fechamento. Confira a ordem: <code>/cartoes add &lt;nome&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>',
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
    registro: formatarRegistro(reg([g(10, 'lazer', 'Cinema')]), HOJE),
    varios: formatarRegistro(
      reg([g(10, 'lazer', 'a'), g(5, 'saude', 'b')]),
      HOJE,
    ),
    audio: comTranscricao('oi', html`x`),
    semGastoAudio: formatarSemGastoNoAudio('oi'),
    resumo: formatarResumo(
      PERIODO,
      dadosComGastos([g(10, 'lazer', 'a')], PERIODO).resumo,
    ),
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

const AGORA = new Date('2026-10-05T15:00:00Z');
const INTER = Cartao.criar({
  nome: 'Inter',
  diaFechamento: 3,
  diaVencimento: 10,
  agora: AGORA,
});
const CARTOES = new Map([[INTER.id, INTER]]);
const OUTUBRO = Periodo.criar('2026-10-01', '2026-10-31', '2026-10-31');

describe('formatarRegistro com cartões, entradas e parcelamentos', () => {
  const vazio = { ...reg([]), cartoes: CARTOES };
  it('gasto no crédito mostra cartão e fatura', () => {
    const gasto = umGasto()
      .em(AGORA)
      .comValor(30)
      .comCategoria('mercado')
      .comDescricao('Mercado')
      .comData('2026-10-05')
      .noCartao(INTER.id, 'credito')
      .build();
    expect(formatarRegistro({ ...vazio, gastos: [gasto] }, HOJE)).toContain(
      '💳 Inter · crédito · fatura nov/2026',
    );
  });
  it('entrada única', () => {
    const e = umaEntrada()
      .comValor(4200)
      .comCategoria('salario')
      .comDescricao('Salário')
      .comData('2026-10-05')
      .build();
    expect(formatarRegistro({ ...vazio, entradas: [e] }, HOJE)).toBe(
      [
        '✅ <b>Entrada registrada!</b>',
        '',
        '💰 Salário',
        '💵 R$ 4.200,00',
        '📝 Salário',
        '📅 Hoje, 05/10',
      ].join('\n'),
    );
  });
  it('parcelamento novo e em andamento', () => {
    const novo = umParcelamento().noCartao(INTER.id).build();
    expect(formatarRegistro({ ...vazio, parcelamentos: [novo] }, HOJE)).toBe(
      [
        '✅ <b>Parcelamento registrado!</b>',
        '',
        '🧾 <b>Monitor</b>: R$ 1.000,00 em 10× de R$ 100,00',
        '     Inter crédito · 1ª parcela na fatura de nov/2026, última em ago/2027',
      ].join('\n'),
    );
    const andamento = umParcelamento()
      .noCartao(INTER.id)
      .aPartirDa(3, '2026-10', '2026-11')
      .build();
    expect(
      formatarRegistro({ ...vazio, parcelamentos: [andamento] }, HOJE),
    ).toContain('parcela 3 de 10 na fatura de nov/2026, última em jun/2027');
  });
  it('lote misto com totais e aviso', () => {
    const gasto = g(30, 'mercado', 'Feira');
    const e = umaEntrada().comValor(100).build();
    const saida = formatarRegistro(
      {
        ...vazio,
        gastos: [gasto],
        entradas: [e],
        avisos: ['reembolso-sem-cartao'],
      },
      HOJE,
    );
    expect(saida).toContain('✅ <b>2 lançamentos registrados!</b>');
    expect(saida).toContain('💵 <b>Gastos: R$ 30,00</b>');
    expect(saida).toContain('💰 <b>Entradas: R$ 100,00</b>');
    expect(saida).toContain(
      'ℹ️ Cadastre seus cartões com /cartoes para abater reembolsos na fatura.',
    );
  });
  it('nome de cartão e descrição saem escapados', () => {
    const c = Cartao.restaurar({
      id: INTER.id,
      nome: '<b>x</b>',
      diaFechamento: 3,
      diaVencimento: 10,
      criadoEm: AGORA,
    });
    const p = umParcelamento().noCartao(c.id).build();
    const saida = formatarRegistro(
      { ...vazio, cartoes: new Map([[c.id, c]]), parcelamentos: [p] },
      HOJE,
    );
    expect(saida).toContain('&lt;b&gt;x&lt;/b&gt; crédito');
    expect(saida).not.toContain('<b>x</b>');
  });
});

describe('formatarEscolha', () => {
  it('pergunta por forma e por cartão', () => {
    expect(formatarEscolha({ tipo: 'forma', indiceGasto: 0 })).toBe(
      '💳 Foi no crédito ou no débito?',
    );
    expect(formatarEscolha({ tipo: 'cartao', alvo: 'gasto', indice: 0 })).toBe(
      '💳 Em qual cartão?',
    );
  });
});

describe('fatura', () => {
  const composicao = comporFatura({
    cartaoId: INTER.id,
    mes: '2026-11',
    vencimento: '2026-11-10',
    inicialCentavos: 40_000,
    comprasCredito: [
      umGasto().em(AGORA).comValor(30).noCartao(INTER.id, 'credito').build(),
    ],
    parcelas: [
      {
        descricao: 'Monitor',
        numero: 1,
        quantidade: 10,
        valor: umParcelamento().build().valorParcela,
      },
    ],
    reembolsos: [],
  });
  it('composição completa', () => {
    expect(formatarFatura(INTER, composicao)).toBe(
      [
        '💳 <b>Fatura Inter nov/2026</b> · vence 10/11/2026',
        '',
        'Valor inicial: R$ 400,00',
        'Compras (1): R$ 30,00',
        'Parcelas (1): R$ 100,00',
        '• Monitor · 1 de 10 · R$ 100,00',
        'Reembolsos: R$ 0,00',
        '<b>Total: R$ 530,00</b>',
      ].join('\n'),
    );
  });
  it('informada, com e sem valor anterior', () => {
    const nova = FaturaInformada.criar({
      cartaoId: INTER.id,
      mes: '2026-11',
      valorInicialCentavos: 40_000,
      agora: AGORA,
    });
    const antiga = FaturaInformada.criar({
      cartaoId: INTER.id,
      mes: '2026-11',
      valorInicialCentavos: 30_000,
      agora: AGORA,
    });
    expect(formatarFaturaInformada(INTER, nova, null, composicao)).toBe(
      '💳 <b>Fatura Inter nov/2026</b>: valor inicial R$ 400,00\nTotal atual: R$ 530,00 · vence 10/11/2026',
    );
    expect(formatarFaturaInformada(INTER, nova, antiga, composicao)).toContain(
      'valor inicial R$ 300,00 → R$ 400,00',
    );
  });
});

describe('formatarResumo', () => {
  it('entradas, gastos, saldo, parcelas e faturas', () => {
    const dados = dadosDoPeriodo({
      periodo: OUTUBRO,
      gastos: [g(520, 'mercado', 'Feira', '2026-10-03')],
      entradas: [umaEntrada().comValor(4200).comCategoria('salario').build()],
      parcelamentos: [
        umParcelamento().noCartao(INTER.id).comDescricao('Monitor').build(),
      ],
      cartoes: [INTER],
      faturas: [
        {
          cartaoNome: 'Inter',
          composicao: comporFatura({
            cartaoId: INTER.id,
            mes: '2026-10',
            vencimento: '2026-10-10',
            inicialCentavos: 21_000,
            comprasCredito: [],
            parcelas: [],
            reembolsos: [],
          }),
        },
      ],
    });
    const saida = formatarResumo(OUTUBRO, dados.resumo);
    expect(saida).toContain('💰 Entradas: R$ 4.200,00 (1)');
    expect(saida).toContain('💸 Gastos: R$ 620,00 (2)');
    expect(saida).toContain('⚖️ Saldo: R$ 3.580,00');
    expect(saida).toContain('<b>Por categoria (compras)</b>');
    expect(saida).toContain('🧾 <b>Parcelamentos (1 · R$ 100,00)</b>');
    expect(saida).toContain(
      '📦 Monitor · 1 de 10 · R$ 100,00 · termina jul/2027',
    );
    expect(saida).toContain('Inter out/2026 (vence 10/10): R$ 210,00');
  });
  it('saldo negativo usa o sinal de menos antes do R$', () => {
    const dados = dadosDoPeriodo({
      periodo: OUTUBRO,
      gastos: [g(100, 'mercado', 'Feira', '2026-10-03')],
    });
    expect(formatarResumo(OUTUBRO, dados.resumo)).toContain(
      '⚖️ Saldo: −R$ 100,00',
    );
  });
});

describe('formatarParcelamentos e barra', () => {
  it('barra com 10 e com 24 parcelas', () => {
    expect(barraDeProgresso(8, 10)).toBe('▰▰▰▰▰▰▰▰▱▱');
    expect(barraDeProgresso(12, 24)).toBe('▰▰▰▰▰▱▱▱▱▱');
    expect(barraDeProgresso(1, 24)).toBe('▰▱▱▱▱▱▱▱▱▱');
    expect(barraDeProgresso(0, 24)).toBe('▱▱▱▱▱▱▱▱▱▱');
  });
  it('lista e vazio', () => {
    const p = umParcelamento().noCartao(INTER.id).build();
    const saida = formatarParcelamentos([
      {
        parcelamento: p,
        cartao: INTER,
        atual: p.parcelaNoMes('2026-10'),
        restantes: 9,
      },
    ]);
    expect(saida).toContain('▰▱▱▱▱▱▱▱▱▱ 1 de 10 · faltam 9');
    expect(saida).toContain('R$ 100,00 por mês · termina jul/2027');
    expect(formatarParcelamentos([])).toContain('Nenhum parcelamento');
  });
});

describe('formatarCartoes', () => {
  it('lista e ajuda de cadastro', () => {
    expect(formatarCartoes([INTER])).toContain(
      '• <b>Inter</b> · fecha dia 3 · vence dia 10',
    );
    expect(formatarCartoes([])).toContain('/cartoes add &lt;nome&gt;');
  });
});

describe('novos erros', () => {
  it('cartão não cadastrado escapa o nome', () => {
    expect(mensagemDeErro(new erros.CartaoNaoCadastradoError('<b>x</b>'))).toBe(
      '💳 O cartão <b>&lt;b&gt;x&lt;/b&gt;</b> não está cadastrado. Use <code>/cartoes add &lt;b&gt;x&lt;/b&gt; &lt;fechamento&gt; &lt;vencimento&gt;</code>',
    );
  });
  it('opções de cartão escapadas', () => {
    expect(
      mensagemDeErro(new erros.EscolhaDeCartaoNecessariaError(['A&B', 'C'])),
    ).toBe('💳 Qual cartão? Você tem: <b>A&amp;B, C</b>.');
  });
  it('registro só com parcelamento', () => {
    expect(mensagemDeErro(new erros.RegistroNaoEncontradoError(true))).toBe(
      '🧾 Parcelamentos se corrigem por /parcelamentos.',
    );
  });
  it.each([
    new erros.NenhumCartaoCadastradoError('x'),
    new erros.CartaoJaExisteError('x'),
    new erros.CartaoEmUsoError('x'),
    new erros.PendenciaExpiradaError('x'),
    new erros.CorrecaoVaziaError('x'),
    new erros.RegistroVazioError('x'),
    new erros.IndiceDeCorrecaoInvalidoError('x'),
    new erros.ParcelamentoSemCreditoError('x'),
    new erros.RegistroNaoEncontradoError(),
  ])('%s tem mensagem própria', (e) => {
    expect(mensagemDeErro(e)).not.toBe(mensagemDeErro(new Error('x')));
  });
});

describe('revisão da Task 15', () => {
  it('nome de cartão com " · " não deforma o bloco do lote', () => {
    const c = Cartao.restaurar({
      id: INTER.id,
      nome: 'A · B',
      diaFechamento: 3,
      diaVencimento: 10,
      criadoEm: AGORA,
    });
    const gasto = umGasto()
      .em(AGORA)
      .comData('2026-10-05')
      .noCartao(c.id, 'credito')
      .build();
    const saida = formatarRegistro(
      {
        ...reg([gasto, g(5, 'saude', 'b')]),
        cartoes: new Map([[c.id, c]]),
      },
      HOJE,
    );
    expect(saida).toContain(' · A · B crédito · fatura nov/2026');
  });
  it('barra com 12 e 13 parcelas e quitada com 24', () => {
    expect(barraDeProgresso(3, 12)).toBe('▰▰▰▱▱▱▱▱▱▱▱▱');
    expect(barraDeProgresso(13, 13)).toBe('▰'.repeat(10));
    expect(barraDeProgresso(1, 13)).toBe('▰▱▱▱▱▱▱▱▱▱');
    expect(barraDeProgresso(24, 24)).toBe('▰'.repeat(10));
  });
  it('fatura com reembolso e com crédito a favor', () => {
    const base = {
      cartaoId: INTER.id,
      mes: '2026-11',
      vencimento: '2026-11-10',
      comprasCredito: [],
      parcelas: [],
    };
    const comReembolso = formatarFatura(
      INTER,
      comporFatura({
        ...base,
        inicialCentavos: 10_000,
        reembolsos: [Dinheiro.deReais(30)],
      }),
    );
    expect(comReembolso).toContain('Reembolsos: −R$ 30,00');
    expect(comReembolso).toContain('<b>Total: R$ 70,00</b>');
    expect(comReembolso).not.toContain('Crédito a favor');
    const comCredito = formatarFatura(
      INTER,
      comporFatura({
        ...base,
        inicialCentavos: 0,
        reembolsos: [Dinheiro.deReais(30)],
      }),
    );
    expect(comCredito).toContain('Crédito a favor: R$ 30,00');
    expect(comCredito).toContain('<b>Total: R$ 0,00</b>');
  });
  it('cartão desconhecido vira "cartão"', () => {
    const e = umaEntrada()
      .comCategoria('reembolso')
      .vinculadaA({ cartaoId: crypto.randomUUID(), mesFatura: '2026-11' })
      .build();
    expect(
      formatarRegistro({ ...reg([g(5, 'saude', 'b')]), entradas: [e] }, HOJE),
    ).toContain('abate fatura cartão nov/2026');
  });
});

describe('formatarEdicao', () => {
  const REG = crypto.randomUUID();
  const uber = umGasto()
    .em(AGORA)
    .comValor(32.5)
    .comCategoria('transporte')
    .comDescricao('Uber')
    .comData('2026-10-04')
    .build();
  const acai = umGasto()
    .em(AGORA)
    .comValor(18)
    .comCategoria('alimentacao')
    .comDescricao('Açaí')
    .comData('2026-10-01')
    .build();
  const novo = umGasto()
    .em(AGORA)
    .comValor(10)
    .comCategoria('transporte')
    .comDescricao('<i>Estacionamento</i>')
    .comData(HOJE)
    .noCartao(INTER.id, 'debito')
    .build();
  const uber35 = uber.editar({ valor: Dinheiro.deReais(35) }, AGORA);

  it('antes e depois, removidos e acrescentados', () => {
    const saida = formatarEdicao(
      {
        registroId: REG,
        antes: [uber, acai],
        depois: [uber35],
        removidos: [acai],
        acrescentados: [novo],
        cartoes: CARTOES,
      },
      HOJE,
    );
    expect(saida).toBe(
      [
        '✏️ <b>Correção do registro</b>',
        '',
        '🔄 🚗 R$ 32,50 · Uber · Ontem, 04/10',
        '     ➡️ 🚗 R$ 35,00 · Uber · Ontem, 04/10',
        '➖ 🍔 R$ 18,00 · Açaí · 01/10',
        '➕ 🚗 R$ 10,00 · &lt;i&gt;Estacionamento&lt;/i&gt; · Hoje, 05/10 · Inter débito',
        '',
        'Confirma?',
      ].join('\n'),
    );
    expect(saida).not.toMatch(/[—–]/);
  });

  it('itens intactos não aparecem; entrada usa 💰', () => {
    const salario = umaEntrada()
      .comValor(4200)
      .comCategoria('salario')
      .comDescricao('Salário')
      .build();
    const salario2 = salario.editar({ valor: Dinheiro.deReais(4300) }, AGORA);
    const saida = formatarEdicao(
      {
        registroId: REG,
        antes: [uber, salario],
        depois: [uber, salario2],
        removidos: [],
        acrescentados: [],
        cartoes: new Map(),
      },
      HOJE,
    );
    expect(saida).not.toContain('Uber');
    expect(saida).toContain('🔄 💰 R$ 4.200,00 · Salário · Hoje, 05/10');
    expect(saida).toContain('➡️ 💰 R$ 4.300,00 · Salário · Hoje, 05/10');
  });
});

describe('mensagens dos comandos e callbacks novos', () => {
  const p = umParcelamento()
    .noCartao(INTER.id)
    .comDescricao('<b>TV</b>')
    .build();
  const saidas = {
    cadastrado: formatarCartaoCadastrado(INTER),
    removido: formatarCartaoRemovido(INTER),
    usoCartoes: MENSAGEM_USO_CARTOES,
    usoFatura: MENSAGEM_USO_FATURA,
    pedirRemocao: formatarPedidoDeRemocao(p),
    parcelamentoRemovido: MENSAGEM_PARCELAMENTO_REMOVIDO,
    parcelamentoMantido: MENSAGEM_PARCELAMENTO_MANTIDO,
    concluido: comDesfecho('<b>x</b>', MENSAGEM_EDICAO_APLICADA),
    expirada: MENSAGEM_PENDENCIA_EXPIRADA,
    aplicada: MENSAGEM_EDICAO_APLICADA,
    cancelada: MENSAGEM_EDICAO_CANCELADA,
  };
  it.each(Object.entries(saidas))(
    '%s tem emoji e não usa travessão',
    (_, h) => {
      expect(h).toMatch(/\p{Extended_Pictographic}/u);
      expect(h).not.toMatch(/[—–]/);
    },
  );
  it('cartão cadastrado e removido', () => {
    expect(formatarCartaoCadastrado(INTER)).toBe(
      '💳 Cartão <b>Inter</b> cadastrado: fecha dia 3, vence dia 10.',
    );
    expect(formatarCartaoRemovido(INTER)).toBe(
      '🗑️ Cartão <b>Inter</b> removido.',
    );
  });
  it('pedido de remoção escapa a descrição', () => {
    expect(formatarPedidoDeRemocao(p)).toContain('&lt;b&gt;TV&lt;/b&gt;');
  });
  it('desfecho escapa o texto original e anexa o resultado', () => {
    expect(comDesfecho(' <b>x</b> ', MENSAGEM_EDICAO_CANCELADA)).toBe(
      '&lt;b&gt;x&lt;/b&gt;\n\n🚫 Correção cancelada.',
    );
    expect(comDesfecho('', MENSAGEM_EDICAO_CANCELADA)).toBe(
      '🚫 Correção cancelada.',
    );
  });
  it('desfecho da edição tira a pergunta "Confirma?"', () => {
    expect(
      formatarDesfechoDaEdicao('a\nb\n\nConfirma?', MENSAGEM_EDICAO_APLICADA),
    ).toBe(comDesfecho('a\nb', MENSAGEM_EDICAO_APLICADA));
    expect(formatarDesfechoDaEdicao('a', MENSAGEM_EDICAO_APLICADA)).toBe(
      comDesfecho('a', MENSAGEM_EDICAO_APLICADA),
    );
  });
  it('popups são texto puro', () => {
    for (const p of [
      POPUP_PENDENCIA_EXPIRADA,
      POPUP_OPCAO_INVALIDA,
      POPUP_PARCELAMENTO_INEXISTENTE,
    ])
      expect(p).not.toMatch(/[<>&—–]/);
  });
  it('faturas de vários cartões separadas por linha em branco', () => {
    const c = comporFatura({
      cartaoId: INTER.id,
      mes: '2026-11',
      vencimento: '2026-11-10',
      inicialCentavos: 0,
      comprasCredito: [],
      parcelas: [],
      reembolsos: [],
    });
    expect(
      formatarFaturas([
        { cartao: INTER, composicao: c },
        { cartao: INTER, composicao: c },
      ]),
    ).toBe(`${formatarFatura(INTER, c)}\n\n${formatarFatura(INTER, c)}`);
  });
});
