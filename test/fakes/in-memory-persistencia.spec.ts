import { testarContratoPersistencia } from '../contracts/persistencia.contract.js';
import { criarMundoEmMemoria } from './in-memory-mundo.js';

testarContratoPersistencia('Fakes em memória', async () =>
  criarMundoEmMemoria(),
);
