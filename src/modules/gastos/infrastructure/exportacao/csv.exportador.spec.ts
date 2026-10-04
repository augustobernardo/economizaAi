import { describe, expect, it } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { Periodo } from '../../domain/periodo.js';
import { celulaCsv, CsvExportador } from './csv.exportador.js';

const PERIODO = Periodo.criar('2026-08-01', '2026-08-31', '2026-10-04');
const AGORA = new Date('2026-08-10T12:00:00Z');
const gastoCom = (descricao: string) =>
  umGasto().comDescricao(descricao).comData('2026-08-10').em(AGORA).build();
const linhas = (buf: Buffer) =>
  buf.toString('utf8').replace(/^﻿/, '').split('\r\n');

describe('CsvExportador', () => {
  it('nome, mime e BOM', () => {
    const arq = new CsvExportador().gerar([gastoCom('x')], PERIODO);
    expect(arq.nomeArquivo).toBe('economizaai-2026-08.csv');
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
    const saida = linhas(new CsvExportador().gerar([g], PERIODO).conteudo);
    expect(saida.slice(0, 2)).toEqual([
      'data;descricao;categoria;valor;origem',
      '10/08/2026;Mercado do mês;mercado;1234,56;texto',
    ]);
    expect(saida.at(-1)).toBe('');
  });

  it('escapa ; aspas e quebra de linha', () => {
    const arq = new CsvExportador().gerar(
      [gastoCom('Pão; "francês"\nquente')],
      PERIODO,
    );
    expect(arq.conteudo.toString('utf8')).toContain(
      '"Pão; ""francês""\nquente"',
    );
  });

  it.each(['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)'])(
    'neutraliza injection em %j',
    (desc) => {
      const linha = linhas(
        new CsvExportador().gerar([gastoCom(desc)], PERIODO).conteudo,
      )[1]!;
      expect(linha.split(';')[1]!.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );
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
