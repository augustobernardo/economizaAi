import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { Periodo } from '../../domain/periodo.js';

export type PedidoDePeriodo =
  { inicio: string; fim: string } | { mesRelativo: 0 | -1 };

export function resolverPeriodo(pedido: PedidoDePeriodo, agora: Date): Periodo {
  const hoje = hojeEmSaoPaulo(agora);
  return 'mesRelativo' in pedido
    ? Periodo.doMes(hoje, pedido.mesRelativo)
    : Periodo.criar(pedido.inicio, pedido.fim, hoje);
}
