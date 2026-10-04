import { normalizarCategoria } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import { Gasto } from '../../domain/gasto.js';
import type { GastoRepository } from '../../domain/ports/gasto.repository.js';
import { NenhumGastoEncontradoError } from '../errors.js';
import type {
  EntradaExtracao,
  ExtratorDeGastos,
} from '../ports/extrator-de-gastos.js';
import type { Relogio } from '../ports/relogio.js';

export class RegistrarGastosUseCase {
  constructor(
    private readonly extrator: ExtratorDeGastos,
    private readonly repositorio: GastoRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar(
    entrada: EntradaExtracao,
  ): Promise<{ registroId: string; gastos: Gasto[]; textoOriginal: string }> {
    const agora = this.relogio.agora();
    const { gastos: extraidos, textoOriginal } = await this.extrator.extrair(
      entrada,
      agora,
    );
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
        origem: entrada.tipo,
        textoOriginal,
        agora,
        registroId,
      }),
    );
    await this.repositorio.salvarVarios(gastos);

    return { registroId, gastos, textoOriginal };
  }
}
