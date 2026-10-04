import { normalizarCategoria } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Gasto, type OrigemGasto } from '../../domain/gasto.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import { NenhumGastoEncontradoError } from '../errors.js';
import type { GastoExtraido } from '../ports/interpretador-de-mensagem.js';
import type { Relogio } from '../ports/relogio.js';

export interface EntradaRegistro {
  gastos: GastoExtraido[];
  origem: OrigemGasto;
  textoOriginal: string;
}

export class RegistrarGastosUseCase {
  constructor(
    private readonly repositorio: GastoRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar({
    gastos: extraidos,
    origem,
    textoOriginal,
  }: EntradaRegistro): Promise<{
    registroId: string;
    gastos: Gasto[];
    textoOriginal: string;
  }> {
    const agora = this.relogio.agora();
    if (extraidos.length === 0) {
      throw new NenhumGastoEncontradoError(
        'Nenhum gasto encontrado na mensagem',
        textoOriginal,
      );
    }

    const registroId = crypto.randomUUID();

    // Todos são criados (e validados) antes de salvar: registro tudo ou nada.
    const gastos = extraidos.map((e) =>
      Gasto.criar({
        valor: Dinheiro.deReais(e.valorReais),
        categoria: normalizarCategoria(e.categoria),
        descricao: e.descricao,
        dataGasto: e.dataGasto,
        origem,
        textoOriginal,
        agora,
        registroId,
      }),
    );
    await this.repositorio.salvarVarios(gastos);

    return { registroId, gastos, textoOriginal };
  }
}
