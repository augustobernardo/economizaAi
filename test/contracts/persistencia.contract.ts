import { beforeEach, describe, expect, it } from 'vitest';
import {
  CartaoJaExisteError,
  CartaoNaoEncontradoError,
  RegistroAlteradoError,
} from '../../src/modules/gastos/application/errors.js';
import { Cartao } from '../../src/modules/gastos/domain/cartao.js';
import { Dinheiro } from '../../src/modules/gastos/domain/dinheiro.js';
import { FaturaInformada } from '../../src/modules/gastos/domain/fatura.js';
import { Gasto } from '../../src/modules/gastos/domain/gasto.js';
import { Parcelamento } from '../../src/modules/gastos/domain/parcelamento.js';
import type { CartaoRepository } from '../../src/modules/gastos/domain/ports/cartao.repository.js';
import type { EntradaRepository } from '../../src/modules/gastos/domain/ports/entrada.repository.js';
import type { FaturaRepository } from '../../src/modules/gastos/domain/ports/fatura.repository.js';
import type { GastoRepository } from '../../src/modules/gastos/domain/ports/gasto.repository.js';
import type { ParcelamentoRepository } from '../../src/modules/gastos/domain/ports/parcelamento.repository.js';
import type { RegistroRepository } from '../../src/modules/gastos/domain/ports/registro.repository.js';
import { umaEntrada } from '../builders/entrada.builder.js';
import { umGasto } from '../builders/gasto.builder.js';
import { umParcelamento } from '../builders/parcelamento.builder.js';

export interface Mundo {
  cartoes: CartaoRepository;
  faturas: FaturaRepository;
  parcelamentos: ParcelamentoRepository;
  entradas: EntradaRepository;
  gastos: GastoRepository;
  registro: RegistroRepository;
  limpar: () => Promise<void>;
}

const AGORA = new Date('2026-10-10T12:00:00Z');
const DEPOIS = new Date('2026-12-01T12:00:00Z');
const VAZIO = { gastos: [], entradas: [], parcelamentos: [] };

function umCartao(nome = 'Nubank'): Cartao {
  return Cartao.criar({
    nome,
    diaFechamento: 3,
    diaVencimento: 10,
    agora: AGORA,
  });
}

/** Gasto acima do teto: só nasce por `restaurar`; o CHECK do banco tem de barrá-lo. */
function gastoAcimaDoTeto(): Gasto {
  const base = umGasto().build();
  return Gasto.restaurar({ ...base, valor: Dinheiro.deCentavos(6_000_000) });
}

function parcelamentoAcimaDoTeto(cartaoId: string): Parcelamento {
  const base = umParcelamento().noCartao(cartaoId).build();
  return Parcelamento.restaurar({
    ...base,
    valorParcela: Dinheiro.deCentavos(4_000_000),
    primeiraParcela: Dinheiro.deCentavos(4_000_000),
  });
}

/** Suíte compartilhada por toda implementação dos ports de cartão, fatura, parcelamento, entrada e registro. */
export function testarContratoPersistencia(
  nome: string,
  fabrica: () => Promise<Mundo>,
): void {
  describe(nome, () => {
    let m: Mundo;

    beforeEach(async () => {
      m = await fabrica();
      await m.limpar();
    });

    describe('CartaoRepository', () => {
      it('salva, busca por id e por nome normalizado', async () => {
        const c = umCartao('Nubank Roxinho');
        await m.cartoes.salvar(c);
        expect(await m.cartoes.buscarPorId(c.id)).toEqual(c);
        expect(await m.cartoes.buscarPorNome('nubank roxinho')).toEqual(c);
        expect(await m.cartoes.buscarPorNome('outro')).toBeNull();
        expect(await m.cartoes.buscarPorId(crypto.randomUUID())).toBeNull();
      });

      it('lista por nome', async () => {
        const [b, a] = [umCartao('Bradesco'), umCartao('Amex')];
        await m.cartoes.salvar(b);
        await m.cartoes.salvar(a);
        expect((await m.cartoes.listar()).map((c) => c.nome)).toEqual([
          'Amex',
          'Bradesco',
        ]);
      });

      it('nome duplicado após normalizar lança CartaoJaExisteError', async () => {
        await m.cartoes.salvar(umCartao('Itaú'));
        await expect(
          m.cartoes.salvar(umCartao('  ITAU ')),
        ).rejects.toBeInstanceOf(CartaoJaExisteError);
        expect(await m.cartoes.listar()).toHaveLength(1);
      });

      it('remove cartão sem uso', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        expect(await m.cartoes.remover(c.id)).toBe('removido');
        expect(await m.cartoes.buscarPorId(c.id)).toBeNull();
      });

      it("remover cartão com gasto devolve 'em-uso' e mantém o cartão", async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        await m.registro.salvar({
          ...VAZIO,
          gastos: [umGasto().noCartao(c.id, 'credito').build()],
        });
        expect(await m.cartoes.remover(c.id)).toBe('em-uso');
        expect(await m.cartoes.buscarPorId(c.id)).not.toBeNull();
      });

      it("remover cartão com fatura, parcelamento ou reembolso devolve 'em-uso'", async () => {
        const [a, b, c] = [umCartao('A'), umCartao('B'), umCartao('C')];
        for (const x of [a, b, c]) await m.cartoes.salvar(x);
        await m.faturas.salvar(
          FaturaInformada.criar({
            cartaoId: a.id,
            mes: '2026-11',
            valorInicialCentavos: 1,
            agora: AGORA,
          }),
        );
        await m.registro.salvar({
          ...VAZIO,
          parcelamentos: [umParcelamento().noCartao(b.id).build()],
          entradas: [
            umaEntrada()
              .comCategoria('reembolso')
              .vinculadaA({ cartaoId: c.id, mesFatura: '2026-11' })
              .build(),
          ],
        });
        expect(await m.cartoes.remover(a.id)).toBe('em-uso');
        expect(await m.cartoes.remover(b.id)).toBe('em-uso');
        expect(await m.cartoes.remover(c.id)).toBe('em-uso');
      });
    });

    describe('FaturaRepository', () => {
      it('upsert devolve a anterior e passa a guardar a nova', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        const nova = (centavos: number) =>
          FaturaInformada.criar({
            cartaoId: c.id,
            mes: '2026-11',
            valorInicialCentavos: centavos,
            agora: AGORA,
          });
        const primeira = nova(10_000);
        const segunda = nova(25_000);

        expect(await m.faturas.salvar(primeira)).toBeNull();
        expect(await m.faturas.salvar(segunda)).toEqual(primeira);
        expect(await m.faturas.buscar(c.id, '2026-11')).toEqual(segunda);
      });

      it('buscar inexistente devolve null; meses diferentes não se misturam', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        await m.faturas.salvar(
          FaturaInformada.criar({
            cartaoId: c.id,
            mes: '2026-11',
            valorInicialCentavos: 0,
            agora: AGORA,
          }),
        );
        expect(await m.faturas.buscar(c.id, '2026-12')).toBeNull();
      });
    });

    describe('GastoRepository.listarCreditoDoCartao', () => {
      it('filtra por cartão, forma crédito e intervalo [início, fim)', async () => {
        const [c, outro] = [umCartao('A'), umCartao('B')];
        await m.cartoes.salvar(c);
        await m.cartoes.salvar(outro);
        const dentro = umGasto()
          .noCartao(c.id, 'credito')
          .comData('2026-10-04')
          .em(DEPOIS)
          .build();
        const noFim = umGasto()
          .noCartao(c.id, 'credito')
          .comData('2026-11-04')
          .em(DEPOIS)
          .build();
        const debito = umGasto()
          .noCartao(c.id, 'debito')
          .comData('2026-10-10')
          .em(DEPOIS)
          .build();
        const deOutro = umGasto()
          .noCartao(outro.id, 'credito')
          .comData('2026-10-10')
          .em(DEPOIS)
          .build();
        const semCartao = umGasto().comData('2026-10-10').em(DEPOIS).build();
        await m.registro.salvar({
          ...VAZIO,
          gastos: [dentro, noFim, debito, deOutro, semCartao],
        });

        const lista = await m.gastos.listarCreditoDoCartao(
          c.id,
          '2026-10-04',
          '2026-11-04',
        );

        expect(lista).toEqual([dentro]);
        expect(lista[0]?.pagamento).toEqual({
          cartaoId: c.id,
          forma: 'credito',
        });
      });
    });

    describe('ParcelamentoRepository', () => {
      it('lista, busca e remove', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        const p = umParcelamento()
          .noCartao(c.id)
          .deTotal(100_001)
          .em(3)
          .build();
        await m.registro.salvar({ ...VAZIO, parcelamentos: [p] });

        expect(await m.parcelamentos.listarTodos()).toEqual([p]);
        expect(await m.parcelamentos.buscarPorId(p.id)).toEqual(p);
        expect(
          await m.parcelamentos.buscarPorId(crypto.randomUUID()),
        ).toBeNull();
        expect(await m.parcelamentos.remover(p.id)).toBe(true);
        expect(await m.parcelamentos.remover(p.id)).toBe(false);
        expect(await m.parcelamentos.listarTodos()).toEqual([]);
      });
    });

    describe('EntradaRepository', () => {
      it('lista por período com início inclusivo, fim exclusivo e ordem por data', async () => {
        const [a, b, fora] = [
          umaEntrada().comData('2026-10-20').em(DEPOIS).build(),
          umaEntrada().comData('2026-10-01').em(DEPOIS).build(),
          umaEntrada().comData('2026-11-01').em(DEPOIS).build(),
        ];
        await m.registro.salvar({ ...VAZIO, entradas: [a, b, fora] });

        const lista = await m.entradas.listarPorPeriodo(
          '2026-10-01',
          '2026-11-01',
        );

        expect(lista).toEqual([b, a]);
      });

      it('listarReembolsosDaFatura filtra por cartão e mês', async () => {
        const [c, outro] = [umCartao('A'), umCartao('B')];
        await m.cartoes.salvar(c);
        await m.cartoes.salvar(outro);
        const reembolso = (cartaoId: string, mesFatura: string) =>
          umaEntrada()
            .comCategoria('reembolso')
            .vinculadaA({ cartaoId, mesFatura })
            .build();
        const alvo = reembolso(c.id, '2026-11');
        await m.registro.salvar({
          ...VAZIO,
          entradas: [
            alvo,
            reembolso(c.id, '2026-12'),
            reembolso(outro.id, '2026-11'),
            umaEntrada().build(),
          ],
        });

        expect(
          await m.entradas.listarReembolsosDaFatura(c.id, '2026-11'),
        ).toEqual([alvo]);
      });
    });

    describe('RegistroRepository', () => {
      it('salva e carrega os três tipos do registro', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        const id = crypto.randomUUID();
        const itens = {
          gastos: [umGasto().doRegistro(id).noCartao(c.id, 'credito').build()],
          entradas: [umaEntrada().doRegistro(id).build()],
          parcelamentos: [
            umParcelamento().doRegistro(id).noCartao(c.id).build(),
          ],
        };
        await m.registro.salvar(itens);
        await m.registro.salvar({ ...VAZIO, gastos: [umGasto().build()] });

        expect(await m.registro.carregar(id)).toEqual(itens);
        expect(await m.registro.carregar(crypto.randomUUID())).toEqual(VAZIO);
      });

      it('parcelamento inválido não grava gasto nem entrada', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);

        await expect(
          m.registro.salvar({
            gastos: [umGasto().build()],
            entradas: [umaEntrada().build()],
            parcelamentos: [parcelamentoAcimaDoTeto(c.id)],
          }),
        ).rejects.toThrow();

        expect(
          await m.gastos.listarPorPeriodo('2000-01-01', '2100-01-01'),
        ).toEqual([]);
        expect(
          await m.entradas.listarPorPeriodo('2000-01-01', '2100-01-01'),
        ).toEqual([]);
        expect(await m.parcelamentos.listarTodos()).toEqual([]);
      });

      it('desfazer remove dos três tipos, respeita criadoDesde e devolve a soma', async () => {
        const c = umCartao();
        await m.cartoes.salvar(c);
        const id = crypto.randomUUID();
        const antigo = umGasto()
          .doRegistro(id)
          .em(new Date('2026-10-10T10:00:00Z'))
          .build();
        const novos = {
          gastos: [umGasto().doRegistro(id).em(AGORA).build()],
          entradas: [umaEntrada().doRegistro(id).em(AGORA).build()],
          parcelamentos: [
            umParcelamento().doRegistro(id).noCartao(c.id).build(),
          ],
        };
        const outro = umGasto().build();
        await m.registro.salvar({
          ...novos,
          gastos: [...novos.gastos, antigo, outro],
        });

        const removidos = await m.registro.desfazer(
          id,
          new Date('2026-10-10T11:00:00Z'),
        );

        expect(removidos).toBe(3);
        const restante = await m.registro.carregar(id);
        expect(restante.gastos).toEqual([antigo]);
        expect(restante.entradas).toEqual([]);
        expect(restante.parcelamentos).toEqual([]);
        expect(
          (await m.gastos.listarUltimos(10)).map((g) => g.id).sort(),
        ).toEqual([antigo.id, outro.id].sort());
      });

      it('aplicarEdicao atualiza, remove e insere gastos e entradas', async () => {
        const g1 = umGasto().comDescricao('antes').build();
        const g2 = umGasto().build();
        const e1 = umaEntrada().build();
        await m.registro.salvar({ ...VAZIO, gastos: [g1, g2], entradas: [e1] });
        const g1Editado = Gasto.restaurar({
          ...g1,
          descricao: 'depois',
          editadoEm: AGORA,
        });
        const novaEntrada = umaEntrada().comDescricao('nova').build();

        await m.registro.aplicarEdicao({
          atualizar: [g1Editado],
          remover: [g2, e1],
          inserir: [novaEntrada],
        });

        expect(await m.gastos.listarUltimos(10)).toEqual([g1Editado]);
        expect(
          await m.entradas.listarPorPeriodo('2000-01-01', '2100-01-01'),
        ).toEqual([novaEntrada]);
      });

      it('aplicarEdicao com id inexistente rejeita e não aplica o resto', async () => {
        const g1 = umGasto().comDescricao('antes').build();
        await m.registro.salvar({ ...VAZIO, gastos: [g1] });
        const g1Editado = Gasto.restaurar({ ...g1, descricao: 'depois' });
        const fantasma = umGasto().build();

        await expect(
          m.registro.aplicarEdicao({
            atualizar: [g1Editado, fantasma],
            remover: [],
            inserir: [],
          }),
        ).rejects.toBeInstanceOf(RegistroAlteradoError);
        await expect(
          m.registro.aplicarEdicao({
            atualizar: [g1Editado],
            remover: [fantasma],
            inserir: [],
          }),
        ).rejects.toBeInstanceOf(RegistroAlteradoError);

        const [gasto] = await m.gastos.listarUltimos(10);
        expect(gasto?.descricao).toBe('antes');
      });

      it('cartão inexistente rejeita com CartaoNaoEncontradoError', async () => {
        const g = umGasto().noCartao(crypto.randomUUID(), 'credito').build();
        await expect(
          m.registro.salvar({ ...VAZIO, gastos: [g] }),
        ).rejects.toBeInstanceOf(CartaoNaoEncontradoError);
        await expect(
          m.registro.aplicarEdicao({
            atualizar: [],
            remover: [],
            inserir: [g],
          }),
        ).rejects.toBeInstanceOf(CartaoNaoEncontradoError);
        expect(await m.gastos.listarUltimos(10)).toEqual([]);
      });

      it('aplicarEdicao é tudo ou nada: o último inserir inválido desfaz o resto', async () => {
        const g1 = umGasto().comDescricao('antes').build();
        const g2 = umGasto().build();
        await m.registro.salvar({ ...VAZIO, gastos: [g1, g2] });
        const g1Editado = Gasto.restaurar({
          ...g1,
          descricao: 'depois',
          editadoEm: AGORA,
        });

        await expect(
          m.registro.aplicarEdicao({
            atualizar: [g1Editado],
            remover: [g2],
            inserir: [gastoAcimaDoTeto()],
          }),
        ).rejects.toThrow();

        const gastos = await m.gastos.listarUltimos(10);
        expect(gastos).toHaveLength(2);
        expect(gastos.find((g) => g.id === g1.id)?.descricao).toBe('antes');
        expect(gastos.find((g) => g.id === g2.id)).toBeDefined();
      });
    });
  });
}
