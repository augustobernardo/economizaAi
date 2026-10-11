import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import {
  dadosComGastos,
  dadosDoPeriodo,
} from '../../../../../test/builders/dados-do-periodo.builder.js';
import { Cartao } from '../../domain/cartao.js';
import { comporFatura } from '../../domain/fatura.js';
import type { Categoria } from '../../domain/categoria.js';
import type { Gasto } from '../../domain/gasto.js';
import { Periodo } from '../../domain/periodo.js';
import { MarkdownExportador } from './markdown.exportador.js';

const PERIODO = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
const AGORA = new Date('2026-08-10T12:00:00Z');
const AGORA_OUT = new Date('2026-10-10T12:00:00Z');
const gasto = (valor: number, categoria: Categoria, desc: string) =>
  umGasto()
    .comValor(valor)
    .comCategoria(categoria)
    .comDescricao(desc)
    .comData('2026-08-10')
    .em(AGORA)
    .build();
const GASTOS = [
  gasto(30, 'alimentacao', 'Almoço'),
  gasto(20, 'alimentacao', 'Lanche'),
  gasto(50, 'mercado', 'Feira'),
];
const gerar = (gastos: readonly Gasto[] = GASTOS) =>
  new MarkdownExportador().gerar(dadosComGastos(gastos, PERIODO));
const texto = (gastos?: readonly Gasto[]) =>
  gerar(gastos).conteudo.toString('utf8');

describe('MarkdownExportador', () => {
  it('nome e mime', () => {
    const arq = gerar();
    expect(arq.nomeArquivo).toBe('economizaai-2026-08.md');
    expect(arq.mimeType).toBe('text/markdown; charset=utf-8');
    expect(arq.formato).toBe('md');
  });

  it('título, resumo, categorias e lançamentos', () => {
    const t = texto();
    expect(t).toContain('# Movimentações — agosto de 2026');
    expect(t).toContain(
      '**Entradas:** R$ 0,00 · **Gastos:** R$ 100,00 · **Saldo:** -R$ 100,00',
    );
    expect(t).toContain('| alimentação | R$ 50,00 | 50% |');
    expect(t).toContain('| mercado | R$ 50,00 | 50% |');
    expect(t).toContain('## Lançamentos');
    expect(t).toContain('| Data | Descrição | Categoria | Valor |');
  });

  it('omite seções vazias', () => {
    const t = texto();
    for (const s of ['## Parcelamentos', '## Entradas', '## Faturas'])
      expect(t).not.toContain(s);
  });

  it('percentual inteiro', () => {
    const t = texto([gasto(20, 'alimentacao', 'a'), gasto(10, 'mercado', 'b')]);
    expect(t).toContain('| alimentação | R$ 20,00 | 67% |');
  });

  it('escapa pipe e quebra de linha na descrição', () => {
    expect(texto([gasto(10, 'mercado', 'a|b\nc')])).toContain('a\\|b c');
  });

  it('escapa sintaxe de link, imagem e HTML na descrição', () => {
    const t = texto([
      gasto(10, 'mercado', '[a](javascript:x)'),
      gasto(5, 'lazer', '<img src=x>'),
      gasto(1, 'outros', '!`c`\\'),
    ]);
    expect(t).toContain('\\[a\\]\\(javascript:x\\)');
    expect(t).toContain('\\<img src=x\\>');
    expect(t).toContain('\\!\\`c\\`\\\\');
    expect(t).not.toContain('[a](');
    expect(t).not.toMatch(/[^\\]<img/);
  });

  it('escapa ênfase, riscado e título na descrição', () => {
    const t = texto([gasto(10, 'mercado', '*negrito* _it_ ~~x~~ #tag')]);
    expect(t).toContain('\\*negrito\\* \\_it\\_ \\~\\~x\\~\\~ \\#tag');
  });

  it('não deixa URL crua virar link', () => {
    const t = texto([
      gasto(10, 'mercado', 'https://exemplo.com'),
      gasto(5, 'lazer', 'www.exemplo.com'),
    ]);
    expect(t).toContain('https\\://exemplo.com');
    expect(t).toContain('www\\.exemplo.com');
    expect(t).not.toContain('https://');
  });

  it('escapa www. após underscore', () => {
    expect(texto([gasto(10, 'lazer', '_www.x.com')])).toContain(
      '\\_www\\.x.com',
    );
  });

  it('não deixa e-mail virar autolink', () => {
    expect(texto([gasto(10, 'lazer', 'a@b.com')])).toContain('a\\@b.com');
  });

  it('soma dos totais por categoria = gastos', () => {
    const t = texto([
      gasto(10, 'mercado', 'a'),
      gasto(20, 'lazer', 'b'),
      gasto(70, 'moradia', 'c'),
    ]);
    const centavos = (v: string) => Number(v.replace(/\D/g, ''));
    const secao = t.split('## Por categoria')[1]!.split('## Lançamentos')[0]!;
    const totais = [...secao.matchAll(/\| (R\$ [\d.,]+) \|/g)].map((m) =>
      centavos(m[1]!),
    );
    expect(totais).toHaveLength(3);
    expect(totais.reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe('MarkdownExportador completo', () => {
  const OUT = Periodo.doMesInformado('2026-10', '2026-10-31');
  const nubank = Cartao.criar({
    nome: '[x](http://a)',
    diaFechamento: 5,
    diaVencimento: 12,
    agora: AGORA,
  });
  const monitor = umParcelamento()
    .noCartao(nubank.id)
    .deParcela(10_000)
    .em(10)
    .aPartirDa(8, '2026-10', '2026-11')
    .build();
  const salario = umaEntrada()
    .comValor(4200)
    .comCategoria('salario')
    .comDescricao('Salário')
    .comData('2026-10-05')
    .build();
  const compra = umGasto()
    .comValor(30)
    .comData('2026-10-05')
    .em(AGORA_OUT)
    .noCartao(nubank.id, 'credito')
    .build();
  const composicao = comporFatura({
    cartaoId: nubank.id,
    mes: '2026-11',
    vencimento: '2026-11-12',
    inicialCentavos: 0,
    comprasCredito: [compra],
    parcelas: [
      {
        descricao: 'Monitor',
        numero: 8,
        quantidade: 10,
        valor: monitor.valorParcela,
      },
    ],
    reembolsos: [],
  });
  const t = new MarkdownExportador()
    .gerar(
      dadosDoPeriodo({
        periodo: OUT,
        gastos: [compra],
        entradas: [salario],
        parcelamentos: [monitor],
        cartoes: [nubank],
        faturas: [{ cartaoNome: nubank.nome, composicao }],
      }),
    )
    .conteudo.toString('utf8');

  it('mostra todas as seções', () => {
    for (const s of [
      '## Por categoria',
      '## Parcelamentos',
      '## Entradas',
      '## Faturas',
      '## Lançamentos',
    ])
      expect(t).toContain(s);
    expect(t).toContain('| Descrição | Parcela | Valor | Termina |');
    expect(t).toContain('| Monitor | 8/10 | R$ 100,00 | 2026-12 |');
    expect(t).toContain(
      '| Cartão | Vencimento | Inicial | Compras | Parcelas | Reembolsos | Total |',
    );
    expect(t).toContain('| 12/11/2026 |');
    expect(t).toContain('| 05/10/2026 | Salário | salário | R$ 4.200,00 |');
    expect(t).toContain(
      '**Entradas:** R$ 4.200,00 · **Gastos:** R$ 130,00 · **Saldo:** R$ 4.070,00',
    );
  });

  it('escapa o nome do cartão', () => {
    expect(t).toContain('\\[x\\]\\(http\\://a\\)');
    expect(t).not.toContain('[x](');
  });

  it('escapa descrição de parcelamento e de entrada', () => {
    const p = umParcelamento()
      .comDescricao('[x](http://a)')
      .em(10)
      .aPartirDa(8, '2026-10', '2026-11')
      .build();
    const e = umaEntrada()
      .comDescricao('[x](http://a)')
      .comData('2026-10-05')
      .build();
    const out = new MarkdownExportador()
      .gerar(
        dadosDoPeriodo({ periodo: OUT, parcelamentos: [p], entradas: [e] }),
      )
      .conteudo.toString('utf8');
    expect(out).not.toContain('[x](');
    expect(out.match(/\\\[x\\\]\\\(http\\:\/\/a\\\)/g)).toHaveLength(2);
  });
});
