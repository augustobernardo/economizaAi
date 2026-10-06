import { describe, expect, it, vi } from 'vitest';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { FakeExportador } from '../../../../../test/fakes/fake-exportador.js';
import { FakeInterpretador } from '../../../../../test/fakes/fake-interpretador.js';
import { InMemoryGastoRepository } from '../../../../../test/fakes/in-memory-gasto.repository.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { ProvedorIndisponivelError } from '../errors.js';
import type {
  EntradaMensagem,
  Interpretacao,
} from '../ports/interpretador-de-mensagem.js';
import { ExportarGastosUseCase } from './exportar-gastos.use-case.js';
import { ListarUltimosGastosUseCase } from './listar-ultimos-gastos.use-case.js';
import { ProcessarMensagemUseCase } from './processar-mensagem.use-case.js';
import { RegistrarGastosUseCase } from './registrar-gastos.use-case.js';
import { ResumirGastosUseCase } from './resumir-gastos.use-case.js';

const AGORA = new Date('2026-10-04T15:00:00Z');
const TEXTO: EntradaMensagem = { tipo: 'texto', texto: 'qualquer coisa' };

async function montar(resposta: Interpretacao | Error) {
  const repositorio = new InMemoryGastoRepository();
  await repositorio.salvarVarios([
    umGasto().em(AGORA).comData('2026-10-02').comValor(20).build(),
  ]);
  const relogio = new RelogioFixo(AGORA);
  const interpretador = new FakeInterpretador(resposta);
  const useCase = new ProcessarMensagemUseCase(
    interpretador,
    relogio,
    new RegistrarGastosUseCase(repositorio, relogio),
    new ExportarGastosUseCase(
      repositorio,
      [new FakeExportador('csv')],
      relogio,
    ),
    new ResumirGastosUseCase(repositorio, relogio),
    new ListarUltimosGastosUseCase(repositorio),
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
        },
      ],
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
    expect(r.resumo.total.centavos).toBe(2000);
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
    });
  });

  it.each([
    ['exportar', ExportarGastosUseCase],
    ['resumir', ResumirGastosUseCase],
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
