import { describe, expect, it, vi } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { FakeExportador } from '../../../../../test/fakes/fake-exportador.js';
import { FakeInterpretador } from '../../../../../test/fakes/fake-interpretador.js';
import { InMemoryCartaoRepository } from '../../../../../test/fakes/in-memory-cartao.repository.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { InMemoryRegistroRepository } from '../../../../../test/fakes/in-memory-registro.repository.js';
import { InMemoryEntradaRepository } from '../../../../../test/fakes/in-memory-entrada.repository.js';
import { InMemoryFaturaRepository } from '../../../../../test/fakes/in-memory-fatura.repository.js';
import { InMemoryParcelamentoRepository } from '../../../../../test/fakes/in-memory-parcelamento.repository.js';
import { Cartao } from '../../domain/cartao.js';
import { PendenciasEmMemoria } from '../../infrastructure/pendencias-em-memoria.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { ProvedorIndisponivelError } from '../errors.js';
import type {
  EntradaMensagem,
  Interpretacao,
} from '../ports/interpretador-de-mensagem.js';
import { ExportarPeriodoUseCase } from './exportar-periodo.use-case.js';
import {
  CompositorDeFatura,
  ConsultarFaturaUseCase,
  InformarFaturaUseCase,
} from './faturas.use-cases.js';
import { ListarUltimosGastosUseCase } from './listar-ultimos-gastos.use-case.js';
import { ProcessarMensagemUseCase } from './processar-mensagem.use-case.js';
import { RegistrarLancamentosUseCase } from './registrar-lancamentos.use-case.js';
import { ResumirPeriodoUseCase } from './resumir-periodo.use-case.js';

const AGORA = new Date('2026-10-04T15:00:00Z');
const TEXTO: EntradaMensagem = { tipo: 'texto', texto: 'qualquer coisa' };

async function montar(resposta: Interpretacao | Error) {
  const repositorio = new InMemoryGastoRepository();
  await repositorio.salvarVarios([
    umGasto().em(AGORA).comData('2026-10-02').comValor(20).build(),
  ]);
  const relogio = new RelogioFixo(AGORA);
  const cartoes = new InMemoryCartaoRepository();
  await cartoes.salvar(
    Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    }),
  );
  await cartoes.salvar(
    Cartao.criar({
      nome: 'Nubank',
      diaFechamento: 25,
      diaVencimento: 5,
      agora: AGORA,
    }),
  );
  const entradas = new InMemoryEntradaRepository();
  const parcelamentos = new InMemoryParcelamentoRepository();
  const faturas = new InMemoryFaturaRepository();
  const registro = new InMemoryRegistroRepository(
    repositorio,
    entradas,
    parcelamentos,
    cartoes,
  );
  const compositor = new CompositorDeFatura(
    repositorio,
    parcelamentos,
    entradas,
    faturas,
  );
  const resumir = new ResumirPeriodoUseCase(
    repositorio,
    entradas,
    parcelamentos,
    cartoes,
    faturas,
    compositor,
    relogio,
  );
  const interpretador = new FakeInterpretador(resposta);
  const useCase = new ProcessarMensagemUseCase(
    interpretador,
    relogio,
    new RegistrarLancamentosUseCase(
      registro,
      cartoes,
      new PendenciasEmMemoria(relogio),
      relogio,
    ),
    new ExportarPeriodoUseCase(resumir, [new FakeExportador('csv')]),
    resumir,
    new ListarUltimosGastosUseCase(repositorio),
    cartoes,
    new InformarFaturaUseCase(cartoes, faturas, compositor, relogio),
    new ConsultarFaturaUseCase(cartoes, compositor, relogio),
  );
  return { interpretador, useCase };
}

describe('ProcessarMensagemUseCase', () => {
  it('registrar → tipo registro, com origem da entrada', async () => {
    const { useCase } = await montar({
      intencao: 'registrar',
      gastos: [
        {
          valorReais: 32.5,
          categoria: 'transporte',
          descricao: 'Uber',
          dataGasto: '2026-10-03',
          cartao: null,
          formaPagamento: null,
        },
      ],
      entradas: [],
      parcelamentos: [],
      textoOriginal: 'uber 32,50',
    });

    const r = await useCase.executar({
      tipo: 'audio',
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    });

    expect(r.tipo).toBe('registro');
    if (r.tipo !== 'registro') return;
    expect(r.gastos[0]?.origem).toBe('audio');
    expect(r.textoOriginal).toBe('uber 32,50');
  });

  it('exportar → tipo exportacao', async () => {
    const { useCase } = await montar({
      intencao: 'exportar',
      inicio: '2026-10-01',
      fim: '2026-10-31',
      textoOriginal: 'exporta outubro',
    });

    const r = await useCase.executar(TEXTO);

    expect(r.tipo).toBe('exportacao');
    if (r.tipo !== 'exportacao') return;
    expect(r.quantidade).toBe(1);
    expect(r.arquivos).toHaveLength(1);
    expect(r.textoOriginal).toBe('exporta outubro');
  });

  it('resumir → tipo resumo', async () => {
    const { useCase } = await montar({
      intencao: 'resumir',
      inicio: '2026-10-01',
      fim: '2026-10-31',
      textoOriginal: 'resumo do mês',
    });

    const r = await useCase.executar(TEXTO);

    expect(r.tipo).toBe('resumo');
    if (r.tipo !== 'resumo') return;
    expect(r.resumo.compras?.total.centavos).toBe(2000);
    expect(r.textoOriginal).toBe('resumo do mês');
  });

  it('listarUltimos → tipo ultimos', async () => {
    const { useCase } = await montar({
      intencao: 'listarUltimos',
      textoOriginal: 'últimos gastos',
    });

    const r = await useCase.executar(TEXTO);

    expect(r.tipo).toBe('ultimos');
    if (r.tipo !== 'ultimos') return;
    expect(r.gastos).toHaveLength(1);
    expect(r.textoOriginal).toBe('últimos gastos');
  });

  it('erro do interpretador propaga', async () => {
    const { useCase } = await montar(new ProvedorIndisponivelError('x'));

    await expect(useCase.executar(TEXTO)).rejects.toBeInstanceOf(
      ProvedorIndisponivelError,
    );
  });

  it('passa relogio.agora() como dataReferencia', async () => {
    const { interpretador, useCase } = await montar({
      intencao: 'listarUltimos',
      textoOriginal: 'x',
    });

    await useCase.executar(TEXTO);

    expect(interpretador.chamadas[0]).toEqual({
      entrada: TEXTO,
      dataReferencia: AGORA,
      contexto: { cartoes: ['Inter', 'Nubank'] },
    });
  });

  it('registrar com escolha pendente → tipo escolha', async () => {
    const { useCase } = await montar({
      intencao: 'registrar',
      gastos: [
        {
          valorReais: 30,
          categoria: 'transporte',
          descricao: 'Uber',
          dataGasto: '2026-10-03',
          cartao: 'Inter',
          formaPagamento: null,
        },
      ],
      entradas: [],
      parcelamentos: [],
      textoOriginal: 'uber no inter',
    });

    const r = await useCase.executar(TEXTO);

    expect(r).toMatchObject({ tipo: 'escolha', escolha: { tipo: 'forma' } });
  });

  it('informarFatura → tipo fatura-informada, com a composição', async () => {
    const { useCase } = await montar({
      intencao: 'informarFatura',
      cartao: 'Inter',
      mes: '2026-10',
      valorReais: 300,
      textoOriginal: 'fatura do inter 300',
    });

    const r = await useCase.executar(TEXTO);

    expect(r.tipo).toBe('fatura-informada');
    if (r.tipo !== 'fatura-informada') return;
    expect(r.cartao.nome).toBe('Inter');
    expect(r.anterior).toBeNull();
    expect(r.composicao.totalCentavos).toBe(30_000);
    expect(r.textoOriginal).toBe('fatura do inter 300');
  });

  it('consultarFatura → tipo faturas, uma por cartão', async () => {
    const { useCase } = await montar({
      intencao: 'consultarFatura',
      cartao: null,
      mes: '2026-10',
      textoOriginal: 'como estão as faturas',
    });

    const r = await useCase.executar(TEXTO);

    expect(r.tipo).toBe('faturas');
    if (r.tipo !== 'faturas') return;
    expect(r.itens.map((i) => i.cartao.nome)).toEqual(['Inter', 'Nubank']);
    expect(r.textoOriginal).toBe('como estão as faturas');
  });

  it.each([
    ['exportar', ExportarPeriodoUseCase],
    ['resumir', ResumirPeriodoUseCase],
  ] as const)(
    '%s recebe só inicio e fim da interpretação',
    async (intencao, Classe) => {
      const espiao = vi.spyOn(Classe.prototype, 'executar');
      const { useCase } = await montar({
        intencao,
        inicio: '2026-10-01',
        fim: '2026-10-04',
        textoOriginal: 'x',
      });

      await useCase.executar(TEXTO);

      expect(espiao).toHaveBeenCalledWith({
        inicio: '2026-10-01',
        fim: '2026-10-04',
      });
      espiao.mockRestore();
    },
  );
});
