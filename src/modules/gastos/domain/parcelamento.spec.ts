import { describe, expect, it } from 'vitest';
import { Dinheiro } from './dinheiro.js';
import { Parcelamento } from './parcelamento.js';
import { umParcelamento } from '../../../../test/builders/parcelamento.builder.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DescricaoVaziaError,
  MesInvalidoError,
  ParcelaInicialInvalidaError,
  QuantidadeDeParcelasInvalidaError,
  RegistroIdVazioError,
  ValorInvalidoError,
  ValorAcimaDoTetoError,
  ValorDoParcelamentoAusenteError,
} from './errors.js';

describe('Parcelamento', () => {
  it('10x de 100: total 1000, parcela 1 no mês da compra e na fatura seguinte', () => {
    const p = umParcelamento()
      .deParcela(10_000)
      .em(10)
      .compradoEm('2026-10-10', '2026-11')
      .build();
    expect(p.total.centavos).toBe(100_000);
    expect(p.parcelaNoMes('2026-10')).toEqual({
      numero: 1,
      quantidade: 10,
      valor: p.valorParcela,
    });
    expect(p.parcelaNaFatura('2026-11')?.numero).toBe(1);
    expect(p.parcelaNaFatura('2027-08')?.numero).toBe(10);
    expect(p.parcelaNaFatura('2027-09')).toBeNull();
    expect(p.parcelaNaFatura('2026-10')).toBeNull();
    expect(p.ultimoMesFatura).toBe('2027-08');
  });
  it('só total: 1000 em 3x → 333,34 + 333,33 + 333,33', () => {
    const p = umParcelamento().deTotal(100_000).em(3).build();
    expect(p.primeiraParcela.centavos).toBe(33_334);
    expect(p.valorParcela.centavos).toBe(33_333);
    expect(p.total.centavos).toBe(100_000);
    expect(p.parcelaNoMes(p.mesCompetenciaInicial)?.valor.centavos).toBe(
      33_334,
    );
  });
  it('com total e parcela, vale a parcela (juros)', () => {
    const p = umParcelamento()
      .deTotal(100_000)
      .deParcela(10_500)
      .em(10)
      .build();
    expect(p.total.centavos).toBe(105_000);
  });
  it('em andamento: parcela 3 de 10 no mês atual; 1 e 2 não existem', () => {
    const p = umParcelamento()
      .deParcela(10_000)
      .em(10)
      .aPartirDa(3, '2026-10', '2026-11')
      .build();
    expect(p.parcelaNoMes('2026-10')?.numero).toBe(3);
    expect(p.parcelaNoMes('2026-09')).toBeNull();
    expect(p.parcelaNaFatura('2027-06')?.numero).toBe(10);
    expect(p.restantesApos(3)).toBe(7);
  });
  it('virada de ano em andamento', () => {
    const p = umParcelamento()
      .deParcela(5_000)
      .em(12)
      .aPartirDa(11, '2026-12', '2027-01')
      .build();
    expect(p.parcelaNoMes('2027-01')?.numero).toBe(12);
    expect(p.parcelaNoMes('2027-02')).toBeNull();
  });
  it('invariantes', () => {
    expect(() => umParcelamento().em(1).build()).toThrow(
      QuantidadeDeParcelasInvalidaError,
    );
    expect(() => umParcelamento().em(49).build()).toThrow(
      QuantidadeDeParcelasInvalidaError,
    );
    expect(() =>
      umParcelamento().em(10).aPartirDa(11, '2026-10', '2026-11').build(),
    ).toThrow(ParcelaInicialInvalidaError);
    expect(() => umParcelamento().semValor().build()).toThrow(
      ValorDoParcelamentoAusenteError,
    );
    expect(() => umParcelamento().deParcela(5_000_000).em(2).build()).toThrow(
      ValorAcimaDoTetoError,
    );
  });
  it('descrição, registro e mês inválidos', () => {
    expect(() => umParcelamento().comDescricao('  ').build()).toThrow(
      DescricaoVaziaError,
    );
    expect(() => umParcelamento().doRegistro(' ').build()).toThrow(
      RegistroIdVazioError,
    );
    expect(() =>
      umParcelamento().aPartirDa(1, '2026-13', '2026-11').build(),
    ).toThrow(MesInvalidoError);
    expect(() => umParcelamento().aPartirDa(1, '2026-10', 'x').build()).toThrow(
      MesInvalidoError,
    );
  });

  describe('janela da dataCompra (agora = 2026-10-10)', () => {
    const nova = (data: string) =>
      umParcelamento().compradoEm(data, '2026-11').build();
    const emAndamento = (data: string, quantidade = 10) =>
      umParcelamento()
        .em(quantidade)
        .compradoEm(data, '2026-11')
        .aPartirDa(3, mesDeData(data), '2026-11')
        .build();
    const mesDeData = (d: string) => d.slice(0, 7);

    it('parcela 1: data futura é recusada', () => {
      expect(() => nova('2026-10-11')).toThrow(DataFuturaError);
    });
    it('parcela 1: mais de 1 ano atrás é recusada; exatamente 1 ano passa', () => {
      expect(() => nova('2025-10-09')).toThrow(DataForaDaJanelaError);
      expect(nova('2025-10-10').dataCompra).toBe('2025-10-10');
    });
    it('em andamento: data futura é recusada', () => {
      expect(() => emAndamento('2026-10-11')).toThrow(DataFuturaError);
    });
    it('em andamento: compra de 10x há 1 ano e 10 meses ainda pode ter parcela aberta', () => {
      expect(emAndamento('2024-12-10').quantidade).toBe(10);
    });
    it('em andamento: compra mais antiga que quantidade meses + 1 ano é recusada', () => {
      expect(() => emAndamento('2024-11-30')).toThrow(DataForaDaJanelaError);
    });
    it('restaurar não valida a janela', () => {
      const p = nova('2026-10-10');
      expect(
        Parcelamento.restaurar({ ...p, dataCompra: '2019-01-01' }).dataCompra,
      ).toBe('2019-01-01');
    });
  });

  describe('total informado com parcela em andamento', () => {
    it('total é da compra inteira: a parcela 1 (já paga) absorve o resto', () => {
      const p = umParcelamento()
        .deTotal(100_000)
        .em(3)
        .aPartirDa(2, '2026-10', '2026-11')
        .build();
      expect(p.total.centavos).toBe(100_000);
      expect(p.parcelaNoMes('2026-10')?.valor.centavos).toBe(33_333);
      expect(p.parcelaNoMes('2026-11')?.valor.centavos).toBe(33_333);
    });
  });

  describe('limites', () => {
    it('total exatamente no teto passa; teto + 1 falha', () => {
      expect(
        umParcelamento().deTotal(5_000_000).em(3).build().total.centavos,
      ).toBe(5_000_000);
      expect(() => umParcelamento().deTotal(5_000_001).em(3).build()).toThrow(
        ValorAcimaDoTetoError,
      );
    });
    it('total menor que a quantidade de parcelas é recusado', () => {
      expect(() => umParcelamento().deTotal(2).em(3).build()).toThrow(
        ValorInvalidoError,
      );
    });
    it('quantidade 2 e 48 passam', () => {
      expect(umParcelamento().em(2).build().quantidade).toBe(2);
      expect(umParcelamento().em(48).build().quantidade).toBe(48);
    });
    it('parcelaInicial 0 e 1.5 são recusadas', () => {
      for (const n of [0, 1.5])
        expect(() =>
          umParcelamento().aPartirDa(n, '2026-10', '2026-11').build(),
        ).toThrow(ParcelaInicialInvalidaError);
    });
    it('ultimoMesCompetencia', () => {
      const p = umParcelamento()
        .em(10)
        .aPartirDa(3, '2026-10', '2026-11')
        .build();
      expect(p.ultimoMesCompetencia).toBe('2027-05');
    });
    it('restaurar preserva os dados e não revalida', () => {
      const p = umParcelamento().build();
      const r = Parcelamento.restaurar({
        id: 'id-1',
        cartaoId: p.cartaoId,
        descricao: '  ',
        categoria: p.categoria,
        quantidade: 1,
        parcelaInicial: 0,
        dataCompra: 'lixo',
        mesCompetenciaInicial: p.mesCompetenciaInicial,
        mesFaturaInicial: p.mesFaturaInicial,
        origem: p.origem,
        textoOriginal: p.textoOriginal,
        registroId: p.registroId,
        valorParcela: Dinheiro.deCentavos(1),
        primeiraParcela: Dinheiro.deCentavos(2),
        criadoEm: p.criadoEm,
      });
      expect(r.id).toBe('id-1');
      expect(r.descricao).toBe('  ');
      expect(r.dataCompra).toBe('lixo');
      expect(r.total.centavos).toBe(2);
    });
    it('parcelaNoMes: última parcela existe, a seguinte não', () => {
      const p = umParcelamento().deParcela(10_000).em(3).build();
      expect(p.parcelaNoMes('2026-12')?.numero).toBe(3);
      expect(p.parcelaNoMes('2027-01')).toBeNull();
    });
    it('mês malformado não gera parcela', () => {
      const p = umParcelamento().build();
      expect(p.parcelaNoMes('x')).toBeNull();
      expect(p.parcelaNaFatura('2026-')).toBeNull();
    });
  });
});
