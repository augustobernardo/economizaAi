import { hojeEmSaoPaulo } from '../../domain/data-civil.js';
import { Periodo } from '../../domain/periodo.js';

export type PedidoDePeriodo =
  { inicio: string; fim: string } | { mesRelativo: 0 | -1 } | { mes: string };

export function resolverPeriodo(pedido: PedidoDePeriodo, agora: Date): Periodo {
  const hoje = hojeEmSaoPaulo(agora);
  if ('mesRelativo' in pedido) return Periodo.doMes(hoje, pedido.mesRelativo);
  if ('mes' in pedido) return Periodo.doMesInformado(pedido.mes, hoje);
  return Periodo.criar(pedido.inicio, pedido.fim, hoje);
}
