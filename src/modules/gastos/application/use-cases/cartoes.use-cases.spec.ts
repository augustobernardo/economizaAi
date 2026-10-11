import { beforeEach, describe, expect, it } from 'vitest';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import {
  CartaoEmUsoError,
  CartaoJaExisteError,
  CartaoNaoCadastradoError,
} from '../errors.js';
import {
  CadastrarCartaoUseCase,
  ListarCartoesUseCase,
  RemoverCartaoUseCase,
} from './cartoes.use-cases.js';

describe('casos de uso de cartões', () => {
  let mundo: Mundo;
  let cadastrar: CadastrarCartaoUseCase;
  const relogio = new RelogioFixo(new Date('2026-10-10T15:00:00Z'));

  beforeEach(() => {
    mundo = criarMundoEmMemoria();
    cadastrar = new CadastrarCartaoUseCase(mundo.cartoes, relogio);
  });

  it('cadastra e lista', async () => {
    const c = await cadastrar.executar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
    });
    expect(c.nome).toBe('Inter');
    expect(await new ListarCartoesUseCase(mundo.cartoes).executar()).toEqual([
      c,
    ]);
  });

  it('nome duplicado (sem caixa/acento) → CartaoJaExisteError', async () => {
    await cadastrar.executar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
    });
    await expect(
      cadastrar.executar({
        nome: 'inter',
        diaFechamento: 3,
        diaVencimento: 10,
      }),
    ).rejects.toBeInstanceOf(CartaoJaExisteError);
  });

  it('remove e devolve o cartão removido', async () => {
    await cadastrar.executar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
    });
    const removido = await new RemoverCartaoUseCase(mundo.cartoes).executar(
      ' INTER ',
    );
    expect(removido.nome).toBe('Inter');
    expect(await mundo.cartoes.listar()).toEqual([]);
  });

  it('remover ausente → CartaoNaoCadastradoError com o nome', async () => {
    const erro = await new RemoverCartaoUseCase(mundo.cartoes)
      .executar('Nubank')
      .catch((e) => e);
    expect(erro).toBeInstanceOf(CartaoNaoCadastradoError);
    expect(erro.nome).toBe('Nubank');
  });

  it('remover em uso → CartaoEmUsoError e o cartão continua', async () => {
    const c = await cadastrar.executar({
      nome: 'Inter',
      diaFechamento: 3,
      diaVencimento: 10,
    });
    await mundo.gastos.salvarVarios([
      umGasto().noCartao(c.id, 'credito').build(),
    ]);
    await expect(
      new RemoverCartaoUseCase(mundo.cartoes).executar('inter'),
    ).rejects.toBeInstanceOf(CartaoEmUsoError);
    expect(await mundo.cartoes.listar()).toHaveLength(1);
  });
});
