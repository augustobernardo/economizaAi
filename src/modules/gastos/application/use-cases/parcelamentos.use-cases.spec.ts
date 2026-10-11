import { beforeEach, describe, expect, it } from 'vitest';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { Cartao } from '../../domain/cartao.js';
import { Parcelamento } from '../../domain/parcelamento.js';
import {
  ListarParcelamentosUseCase,
  RemoverParcelamentoUseCase,
} from './parcelamentos.use-cases.js';

const AGORA = new Date('2026-10-10T15:00:00Z');

describe('casos de uso de parcelamentos', () => {
  let mundo: Mundo;
  let cartao: Cartao;
  let listar: ListarParcelamentosUseCase;

  const guardar = (p: Parcelamento) =>
    mundo.registro.salvar({ gastos: [], entradas: [], parcelamentos: [p] });

  beforeEach(async () => {
    mundo = criarMundoEmMemoria();
    cartao = Cartao.criar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
      agora: AGORA,
    });
    await mundo.cartoes.salvar(cartao);
    listar = new ListarParcelamentosUseCase(
      mundo.parcelamentos,
      mundo.cartoes,
      new RelogioFixo(AGORA),
    );
  });

  it('lista ativo com parcela atual e restantes', async () => {
    const p = umParcelamento()
      .noCartao(cartao.id)
      .em(10)
      .aPartirDa(3, '2026-10', '2026-11')
      .build();
    await guardar(p);
    const [item] = await listar.executar();
    expect(item!.cartao.id).toBe(cartao.id);
    expect(item!.atual?.numero).toBe(3);
    expect(item!.restantes).toBe(7);
  });

  it('ainda não começou: atual nulo, restantes = quantidade − (parcelaInicial − 1)', async () => {
    // Data futura não passa em criar; restaurar simula um registro já persistido.
    const p = Parcelamento.restaurar({
      ...umParcelamento().noCartao(cartao.id).em(4).build(),
      dataCompra: '2026-12-05',
      mesCompetenciaInicial: '2026-12',
      mesFaturaInicial: '2027-01',
    });
    await guardar(p);
    const [item] = await listar.executar();
    expect(item!.atual).toBeNull();
    expect(item!.restantes).toBe(4);
  });

  it('exclui parcelamento terminado', async () => {
    const p = umParcelamento()
      .noCartao(cartao.id)
      .em(3)
      .compradoEm('2026-05-05', '2026-06')
      .build();
    await guardar(p);
    expect(await listar.executar()).toEqual([]);
  });

  it('remove por id; id ausente → false', async () => {
    const p = umParcelamento().noCartao(cartao.id).build();
    await guardar(p);
    const remover = new RemoverParcelamentoUseCase(mundo.parcelamentos);
    expect(await remover.executar(p.id)).toBe(true);
    expect(await remover.executar(p.id)).toBe(false);
  });
});
