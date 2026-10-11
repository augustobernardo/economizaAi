import type { Mundo } from '../contracts/persistencia.contract.js';
import { InMemoryCartaoRepository } from './in-memory-cartao.repository.js';
import { InMemoryEntradaRepository } from './in-memory-entrada.repository.js';
import { InMemoryFaturaRepository } from './in-memory-fatura.repository.js';
import { InMemoryGastoRepository } from './in-memory-gasto.repository.js';
import { InMemoryParcelamentoRepository } from './in-memory-parcelamento.repository.js';
import { InMemoryRegistroRepository } from './in-memory-registro.repository.js';

/** Todos os fakes ligados entre si, como o banco real liga as tabelas. */
export function criarMundoEmMemoria(): Mundo {
  const gastos = new InMemoryGastoRepository();
  const entradas = new InMemoryEntradaRepository();
  const parcelamentos = new InMemoryParcelamentoRepository();
  const faturas = new InMemoryFaturaRepository();
  const cartoes = new InMemoryCartaoRepository(
    (id) =>
      gastos.usaCartao(id) ||
      entradas.usaCartao(id) ||
      parcelamentos.usaCartao(id) ||
      faturas.usaCartao(id),
  );
  return {
    cartoes,
    faturas,
    parcelamentos,
    entradas,
    gastos,
    registro: new InMemoryRegistroRepository(
      gastos,
      entradas,
      parcelamentos,
      cartoes,
    ),
    limpar: async () => {
      [gastos, entradas, parcelamentos, faturas, cartoes].forEach((r) =>
        r.limpar(),
      );
    },
  };
}
