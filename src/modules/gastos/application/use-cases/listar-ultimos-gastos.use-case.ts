import type { Gasto } from '../../domain/gasto.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import { NenhumGastoRegistradoError } from '../errors.js';

export const LIMITE_ULTIMOS = 10;

export class ListarUltimosGastosUseCase {
  constructor(private readonly repositorio: GastoRepository) {}

  async executar(limite = LIMITE_ULTIMOS): Promise<Gasto[]> {
    const gastos = await this.repositorio.listarUltimos(limite);
    if (gastos.length === 0)
      throw new NenhumGastoRegistradoError('Nenhum gasto registrado ainda');
    return gastos;
  }
}
