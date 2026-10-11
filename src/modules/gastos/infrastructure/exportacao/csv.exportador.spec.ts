import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import {
  dadosComGastos,
  dadosDoPeriodo,
} from '../../../../../test/builders/dados-do-periodo.builder.js';
import { Cartao } from '../../domain/cartao.js';
import type { Gasto } from '../../domain/gasto.js';
import { Periodo } from '../../domain/periodo.js';
import { celulaCsv, CsvExportador } from './csv.exportador.js';

const PERIODO = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
const OUT = Periodo.doMesInformado('2026-10', '2026-10-31');
const AGORA = new Date('2026-08-10T12:00:00Z');
const AGORA_OUT = new Date('2026-10-10T12:00:00Z');
const gastoCom = (descricao: string) =>
  umGasto().comDescricao(descricao).comData('2026-08-10').em(AGORA).build();
const dados = (gastos: Gasto[]) => dadosComGastos(gastos, PERIODO);
const linhas = (buf: Buffer) =>
  buf.toString('utf8').replace(/^﻿/, '').split('\r\n');

describe('CsvExportador', () => {
  it('nome, mime e BOM', () => {
    const arq = new CsvExportador().gerar(dados([gastoCom('x')]));
    expect(arq.nomeArquivo).toBe('economizaai-2026-08.csv');
    expect(arq.formato).toBe('csv');
    expect(arq.mimeType).toBe('text/csv; charset=utf-8');
    expect(arq.conteudo.subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
  });

  it('cabeçalho e linha no padrão brasileiro', () => {
    const g = umGasto()
      .comValor(1234.56)
      .comDescricao('Mercado do mês')
      .comCategoria('mercado')
      .comData('2026-08-10')
      .em(AGORA)
      .build();
    const saida = linhas(new CsvExportador().gerar(dados([g])).conteudo);
    expect(saida.slice(0, 2)).toEqual([
      'tipo;data;descricao;categoria;valor;origem;cartao;forma',
      'gasto;10/08/2026;Mercado do mês;mercado;-1234,56;texto;;',
    ]);
    expect(saida.at(-1)).toBe('');
  });

  it('escapa ; aspas e quebra de linha', () => {
    const arq = new CsvExportador().gerar(
      dados([gastoCom('Pão; "francês"\nquente')]),
    );
    expect(arq.conteudo.toString('utf8')).toContain(
      '"Pão; ""francês""\nquente"',
    );
  });

  it.each(['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)'])(
    'neutraliza injection em %j',
    (desc) => {
      const linha = linhas(
        new CsvExportador().gerar(dados([gastoCom(desc)])).conteudo,
      )[1]!;
      expect(linha.split(';')[2]!.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );
});

describe('CsvExportador com cartões, parcelas e entradas', () => {
  const nubank = Cartao.criar({
    nome: 'Nubank',
    diaFechamento: 5,
    diaVencimento: 12,
    agora: AGORA,
  });
  const gastoNoCartao = umGasto()
    .comValor(30)
    .comDescricao('Uber')
    .comCategoria('transporte')
    .comData('2026-10-05')
    .em(AGORA_OUT)
    .noCartao(nubank.id, 'credito')
    .build();
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
  const dadosCompletos = () =>
    dadosDoPeriodo({
      periodo: OUT,
      gastos: [gastoNoCartao],
      entradas: [salario],
      parcelamentos: [monitor],
      cartoes: [nubank],
    });
  const gerar = (d = dadosCompletos()) =>
    linhas(new CsvExportador().gerar(d).conteudo).slice(1, -1);

  it('ordena por data e tipo, com sinais, parcela e cartão', () => {
    expect(gerar()).toEqual([
      'parcela;01/10/2026;Monitor (8/10);outros;-100,00;texto;Nubank;credito',
      'gasto;05/10/2026;Uber;transporte;-30,00;texto;Nubank;credito',
      'entrada;05/10/2026;Salário;salario;4200,00;texto;;',
    ]);
  });

  it('soma da coluna valor = saldo do resumo', () => {
    const d = dadosCompletos();
    const soma = gerar(d)
      .map((l) => Number(l.split(';')[4]!.replace(',', '.')))
      .reduce((a, b) => a + b, 0);
    expect(Math.round(soma * 100)).toBe(d.resumo.saldoCentavos);
  });

  it('neutraliza injection no nome do cartão', () => {
    const mau = Cartao.criar({
      nome: '=HYPERLINK("x")',
      diaFechamento: 5,
      diaVencimento: 12,
      agora: AGORA,
    });
    const g = umGasto()
      .comData('2026-10-05')
      .em(AGORA_OUT)
      .noCartao(mau.id, 'debito')
      .build();
    const [linha] = gerar(
      dadosDoPeriodo({ periodo: OUT, gastos: [g], cartoes: [mau] }),
    );
    expect(linha).toContain(';"\'=HYPERLINK(');
    expect(linha!.endsWith(';debito')).toBe(true);
  });

  it('entrada vinculada mostra o cartão do vínculo', () => {
    const reembolso = umaEntrada()
      .comValor(10)
      .comCategoria('reembolso')
      .comData('2026-10-06')
      .vinculadaA({ cartaoId: nubank.id, mesFatura: '2026-11' })
      .build();
    const [linha] = gerar(
      dadosDoPeriodo({
        periodo: OUT,
        entradas: [reembolso],
        cartoes: [nubank],
      }),
    );
    expect(linha!.split(';').slice(6)).toEqual(['Nubank', '']);
  });
});

describe('CsvExportador: parcelas e injection', () => {
  const gerar = (d: ReturnType<typeof dadosDoPeriodo>) =>
    linhas(new CsvExportador().gerar(d).conteudo).slice(1, -1);
  const parcelamento = (inicial: number, mesComp: string, desc = 'Monitor') =>
    umParcelamento()
      .comDescricao(desc)
      .em(10)
      .aPartirDa(inicial, mesComp, mesComp)
      .build();
  const periodo = (mes: string) => Periodo.doMesInformado(mes, '2027-12-31');

  it.each([
    [1, '2026-11', '2027-01', '(3/10)', '01/01/2027'],
    [1, '2026-11', '2026-12', '(2/10)', '01/12/2026'],
    [3, '2026-12', '2027-01', '(4/10)', '01/01/2027'],
  ])(
    'parcela %i desde %s em %s cruza o ano: %s',
    (inicial, mesComp, mes, rotulo, data) => {
      const [linha] = gerar(
        dadosDoPeriodo({
          periodo: periodo(mes),
          parcelamentos: [parcelamento(inicial, mesComp)],
        }),
      );
      const cols = linha!.split(';');
      expect(cols[1]).toBe(data);
      expect(cols[2]).toBe(`Monitor ${rotulo}`);
    },
  );

  it('neutraliza fórmula na descrição da parcela', () => {
    const [linha] = gerar(
      dadosDoPeriodo({
        periodo: periodo('2026-10'),
        parcelamentos: [parcelamento(8, '2026-10', '=1+1')],
      }),
    );
    expect(linha!.split(';')[2]).toBe("'=1+1 (8/10)");
  });

  it('neutraliza fórmula na descrição da entrada', () => {
    const e = umaEntrada().comDescricao('@x').comData('2026-10-05').build();
    const [linha] = gerar(
      dadosDoPeriodo({ periodo: periodo('2026-10'), entradas: [e] }),
    );
    expect(linha!.split(';')[2]).toBe("'@x");
  });
});

describe('celulaCsv', () => {
  it.each(['\tx', '\rx', '=1', '+1', '-1', '@a'])(
    'prefixa apóstrofo em %j',
    (v) => {
      expect(celulaCsv(v).replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('texto comum passa intacto', () => {
    expect(celulaCsv('Almoço')).toBe('Almoço');
  });
});
