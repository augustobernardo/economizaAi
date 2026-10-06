import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import type { Categoria } from '../../domain/categoria.js';
import type { Gasto } from '../../domain/gasto.js';
import { Periodo } from '../../domain/periodo.js';
import { MarkdownExportador } from './markdown.exportador.js';

const PERIODO = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
const AGORA = new Date('2026-08-10T12:00:00Z');
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
  new MarkdownExportador().gerar(gastos, PERIODO);
const texto = (gastos?: readonly Gasto[]) =>
  gerar(gastos).conteudo.toString('utf8');

describe('MarkdownExportador', () => {
  it('nome e mime', () => {
    const arq = gerar();
    expect(arq.nomeArquivo).toBe('economizaai-2026-08.md');
    expect(arq.mimeType).toBe('text/markdown; charset=utf-8');
    expect(arq.formato).toBe('md');
  });

  it('título, total, categorias e maior gasto', () => {
    const t = texto();
    expect(t).toContain('# Gastos — agosto de 2026');
    expect(t).toContain('**Total:** R$ 100,00 (3 gastos)');
    expect(t).toContain('| alimentação | R$ 50,00 | 50% |');
    expect(t).toContain('| mercado | R$ 50,00 | 50% |');
    expect(t).toContain('**Maior gasto:**');
    expect(t).toContain('| Data | Descrição | Categoria | Valor |');
  });

  it('um gasto fica no singular', () => {
    expect(texto([gasto(10, 'mercado', 'Pão')])).toContain('(1 gasto)');
  });

  it('percentual com casa decimal', () => {
    const t = texto([gasto(20, 'alimentacao', 'a'), gasto(10, 'mercado', 'b')]);
    expect(t).toContain('| alimentação | R$ 20,00 | 66,7% |');
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

  it('soma dos totais por categoria = total geral', () => {
    const t = texto([
      gasto(10, 'mercado', 'a'),
      gasto(20, 'lazer', 'b'),
      gasto(70, 'moradia', 'c'),
    ]);
    const centavos = (v: string) => Number(v.replace(/\D/g, ''));
    const secao = t.split('## Por categoria')[1]!.split('**Maior gasto')[0]!;
    const totais = [...secao.matchAll(/\| (R\$ [\d.,]+) \|/g)].map((m) =>
      centavos(m[1]!),
    );
    const total = centavos(t.match(/\*\*Total:\*\* (R\$ [\d.,]+)/)![1]!);
    expect(totais).toHaveLength(3);
    expect(totais.reduce((a, b) => a + b, 0)).toBe(total);
    expect(total).toBe(10000);
  });
});
