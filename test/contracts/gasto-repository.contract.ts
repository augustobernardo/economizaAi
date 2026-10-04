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
    registroId: gasto.registroId,
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

    it('desempata a mesma dataGasto por criadoEm crescente', async () => {
      const cedo = umGasto()
        .comData('2026-06-10')
        .em(new Date('2026-06-10T10:00:00Z'))
        .build();
      const tarde = umGasto()
        .comData('2026-06-10')
        .em(new Date('2026-06-10T15:00:00Z'))
        .build();
      await repositorio.salvarVarios([tarde, cedo]);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );

      expect(lista.map((g) => g.id)).toEqual([cedo.id, tarde.id]);
    });

    it('período vazio quando início igual ao fim', async () => {
      await repositorio.salvarVarios([umGasto().comData('2026-06-10').build()]);

      const lista = await repositorio.listarPorPeriodo(
        '2026-06-10',
        '2026-06-10',
      );

      expect(lista).toEqual([]);
    });

    it('remove só os gastos do registro pedido e devolve a contagem', async () => {
      const agora = new Date('2026-06-15T12:00:00Z');
      const registro = crypto.randomUUID();
      const a = umGasto().doRegistro(registro).em(agora).build();
      const b = umGasto().doRegistro(registro).em(agora).build();
      const outro = umGasto().em(agora).build();
      await repositorio.salvarVarios([a, b, outro]);

      const removidos = await repositorio.removerDoRegistro(
        registro,
        new Date('2026-06-15T11:00:00Z'),
      );

      expect(removidos).toBe(2);
      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );
      expect(lista.map((g) => g.id)).toEqual([outro.id]);
    });

    it('não remove gastos do registro criados antes de criadoDesde', async () => {
      const registro = crypto.randomUUID();
      await repositorio.salvarVarios([
        umGasto()
          .doRegistro(registro)
          .em(new Date('2026-06-15T10:00:00Z'))
          .build(),
      ]);

      const removidos = await repositorio.removerDoRegistro(
        registro,
        new Date('2026-06-15T11:00:00Z'),
      );

      expect(removidos).toBe(0);
      const lista = await repositorio.listarPorPeriodo(
        '2026-06-01',
        '2026-07-01',
      );
      expect(lista).toHaveLength(1);
    });

    it('registro inexistente devolve 0 sem lançar', async () => {
      await expect(
        repositorio.removerDoRegistro(crypto.randomUUID(), new Date(0)),
      ).resolves.toBe(0);
    });

    it('salvar lista vazia não faz nada', async () => {
      await expect(repositorio.salvarVarios([])).resolves.toBeUndefined();

      const lista = await repositorio.listarPorPeriodo(
        '2026-01-01',
        '2027-01-01',
      );
      expect(lista).toEqual([]);
    });
  });
}
