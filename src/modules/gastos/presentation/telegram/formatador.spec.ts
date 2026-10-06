import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  ValorAcimaDoTetoError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import { formatarRegistro, mensagemDeErro } from './formatador.js';

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
