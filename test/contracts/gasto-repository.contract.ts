import { beforeEach, describe, expect, it } from 'vitest';
import type { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import type { GastoRepository } from '../../src/modules/gastos/domain/ports/gasto.repository.js';
import { umGasto } from '../builders/gasto.builder.js';

interface Fabrica {
  repositorio: GastoRepository;
  limpar: () => Promise<void>;
}

function resumo(gasto: Gasto) {
  return {
    id: gasto.id,
    centavos: gasto.valor.centavos,
    categoria: gasto.categoria,
    descricao: gasto.descricao,
    dataGasto: gasto.dataGasto,
    origem: gasto.origem,
    textoOriginal: gasto.textoOriginal,
    criadoEm: gasto.criadoEm.getTime(),
  };
}

/** Suíte compartilhada por toda implementação de `GastoRepository`. */
export function testarContratoGastoRepository(
  nome: string,
  fabrica: () => Promise<Fabrica>,
): void {
  describe(nome, () => {
    let repositorio: GastoRepository;
    let limparBase: () => Promise<void>;

    beforeEach(async () => {
      const f = await fabrica();
      repositorio = f.repositorio;
      limparBase = f.limpar;
      await limparBase();
    });

    it('salva vários e lista no período', async () => {
      const a = umGasto().comData('2026-06-10').build();
      const b = umGasto().comData('2026-06-14').build();

      await repositorio.salvarVarios([a, b]);
      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );

      expect(lista.map(resumo)).toEqual([resumo(a), resumo(b)]);
    });

    it('início é inclusivo e fim é exclusivo', async () => {
      const gastos = [
        '2026-05-31',
        '2026-06-01',
        '2026-06-30',
        '2026-07-01',
      ].map((d) =>
        umGasto().comData(d).em(new Date('2026-07-15T12:00:00Z')).build(),
      );
      await repositorio.salvarVarios(gastos);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );

      expect(lista.map((g) => g.dataGasto)).toEqual([
        '2026-06-01',
        '2026-06-30',
      ]);
    });

    it('período vazio quando início igual ao fim', async () => {
      await repositorio.salvarVarios([umGasto().comData('2026-06-10').build()]);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-10',
        '2026-06-10',
      );

      expect(lista).toEqual([]);
    });

    it('remove por ids', async () => {
      const gastos = [
        umGasto().comData('2026-06-10').build(),
        umGasto().comData('2026-06-11').build(),
        umGasto().comData('2026-06-12').build(),
      ];
      await repositorio.salvarVarios(gastos);

      await repositorio.removerPorIds([gastos[0]!.id, gastos[2]!.id]);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );
      expect(lista.map((g) => g.id)).toEqual([gastos[1]!.id]);
    });

    it('remover lista vazia não faz nada', async () => {
      await repositorio.salvarVarios([umGasto().comData('2026-06-10').build()]);

      await repositorio.removerPorIds([]);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );
      expect(lista).toHaveLength(1);
    });

    it('remover id inexistente não lança', async () => {
      await expect(
        repositorio.removerPorIds([crypto.randomUUID()]),
      ).resolves.toBeUndefined();
    });
  });
}
