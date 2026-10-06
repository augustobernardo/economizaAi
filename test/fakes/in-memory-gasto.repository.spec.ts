import { testarContratoGastoRepository } from '../contracts/gasto-repository.contract.js';
import { InMemoryGastoRepository } from './in-memory-gasto.repository.js';

testarContratoGastoRepository('InMemoryGastoRepository', async () => {
  const r = new InMemoryGastoRepository();
  return { repositorio: r, limpar: async () => r.limpar() };
});
