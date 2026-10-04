import { Dinheiro } from '../../src/modules/gastos/domain/dinheiro.js';
import type { Categoria } from '../../src/modules/gastos/domain/categoria.js';
import type { OrigemGasto } from '../../src/modules/gastos/domain/gasto.js';
import { Gasto } from '../../src/modules/gastos/domain/gasto.js';

/** Data de referência fixa, usada como "agora" padrão do builder. */
const AGORA_PADRAO = new Date('2026-06-15T12:00:00Z');

interface PropsBuilder {
  valorReais: number;
  categoria: Categoria;
  descricao: string;
  dataGasto: string;
  origem: OrigemGasto;
  textoOriginal: string;
  agora: Date;
  registroId: string;
}

/** Builder fluente de `Gasto` com defaults válidos, para specs de domínio. */
export function umGasto() {
  const props: PropsBuilder = {
    valorReais: 50,
    categoria: 'mercado',
    descricao: 'Compra no mercado',
    dataGasto: '2026-06-15',
    origem: 'texto',
    textoOriginal: 'gastei 50 no mercado',
    agora: AGORA_PADRAO,
    registroId: crypto.randomUUID(),
  };

  return {
    comValor(reais: number) {
      props.valorReais = reais;
      return this;
    },
    comDescricao(descricao: string) {
      props.descricao = descricao;
      return this;
    },
    comData(dataGasto: string) {
      props.dataGasto = dataGasto;
      return this;
    },
    comCategoria(categoria: Categoria) {
      props.categoria = categoria;
      return this;
    },
    em(agora: Date) {
      props.agora = agora;
      return this;
    },
    doRegistro(registroId: string) {
      props.registroId = registroId;
      return this;
    },
    build(): Gasto {
      return Gasto.criar({
        valor: Dinheiro.deReais(props.valorReais),
        categoria: props.categoria,
        descricao: props.descricao,
        dataGasto: props.dataGasto,
        origem: props.origem,
        textoOriginal: props.textoOriginal,
        agora: props.agora,
        registroId: props.registroId,
      });
    },
  };
}
