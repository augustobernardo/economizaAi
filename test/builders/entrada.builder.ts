import type { CategoriaEntrada } from '../../src/modules/gastos/domain/categoria-entrada.js';
import { Dinheiro } from '../../src/modules/gastos/domain/dinheiro.js';
import {
  Entrada,
  type VinculoFatura,
} from '../../src/modules/gastos/domain/entrada.js';
import type { OrigemGasto } from '../../src/modules/gastos/domain/gasto.js';

/** "Agora" padrão do builder. */
const AGORA_PADRAO = new Date('2026-10-10T12:00:00Z');

interface PropsBuilder {
  valorReais: number;
  categoria: CategoriaEntrada;
  descricao: string;
  dataEntrada: string;
  origem: OrigemGasto;
  textoOriginal: string;
  agora: Date;
  registroId: string;
  vinculo: VinculoFatura | null;
}

/** Builder fluente de `Entrada` com defaults válidos, para specs. */
export function umaEntrada() {
  const props: PropsBuilder = {
    valorReais: 100,
    categoria: 'transferencia',
    descricao: 'Transferência recebida',
    dataEntrada: '2026-10-05',
    origem: 'texto',
    textoOriginal: 'recebi 100 de transferência',
    agora: AGORA_PADRAO,
    registroId: crypto.randomUUID(),
    vinculo: null,
  };

  return {
    comValor(reais: number) {
      props.valorReais = reais;
      return this;
    },
    comCategoria(categoria: CategoriaEntrada) {
      props.categoria = categoria;
      return this;
    },
    comDescricao(descricao: string) {
      props.descricao = descricao;
      return this;
    },
    comData(dataEntrada: string) {
      props.dataEntrada = dataEntrada;
      return this;
    },
    vinculadaA(vinculo: VinculoFatura) {
      props.vinculo = vinculo;
      return this;
    },
    doRegistro(registroId: string) {
      props.registroId = registroId;
      return this;
    },
    em(agora: Date) {
      props.agora = agora;
      return this;
    },
    build(): Entrada {
      return Entrada.criar({
        valor: Dinheiro.deReais(props.valorReais),
        categoria: props.categoria,
        descricao: props.descricao,
        dataEntrada: props.dataEntrada,
        origem: props.origem,
        textoOriginal: props.textoOriginal,
        agora: props.agora,
        registroId: props.registroId,
        vinculo: props.vinculo,
      });
    },
  };
}
