import { mesDe } from '../../src/modules/gastos/domain/mes.js';
import {
  Parcelamento,
  type PropsCriarParcelamento,
} from '../../src/modules/gastos/domain/parcelamento.js';

/** Builder fluente de `Parcelamento` com defaults válidos, para specs de domínio. */
export function umParcelamento() {
  const props: PropsCriarParcelamento = {
    cartaoId: crypto.randomUUID(),
    descricao: 'Monitor',
    categoria: 'outros',
    totalCentavos: null,
    valorParcelaCentavos: 10_000,
    quantidade: 10,
    parcelaInicial: 1,
    dataCompra: '2026-10-10',
    mesCompetenciaInicial: '2026-10',
    mesFaturaInicial: '2026-11',
    origem: 'texto',
    textoOriginal: 'comprei um monitor em 10x de 100',
    registroId: crypto.randomUUID(),
    agora: new Date('2026-10-10T12:00:00Z'),
  };

  return {
    deParcela(centavos: number) {
      props.valorParcelaCentavos = centavos;
      return this;
    },
    deTotal(centavos: number) {
      props.totalCentavos = centavos;
      props.valorParcelaCentavos = null;
      return this;
    },
    semValor() {
      props.totalCentavos = null;
      props.valorParcelaCentavos = null;
      return this;
    },
    em(quantidade: number) {
      props.quantidade = quantidade;
      return this;
    },
    compradoEm(dataCompra: string, mesFatura: string) {
      props.dataCompra = dataCompra;
      props.mesCompetenciaInicial = mesDe(dataCompra);
      props.mesFaturaInicial = mesFatura;
      return this;
    },
    aPartirDa(
      parcelaInicial: number,
      mesCompetencia: string,
      mesFatura: string,
    ) {
      props.parcelaInicial = parcelaInicial;
      props.mesCompetenciaInicial = mesCompetencia;
      props.mesFaturaInicial = mesFatura;
      return this;
    },
    noCartao(cartaoId: string) {
      props.cartaoId = cartaoId;
      return this;
    },
    doRegistro(registroId: string) {
      props.registroId = registroId;
      return this;
    },
    comDescricao(descricao: string) {
      props.descricao = descricao;
      return this;
    },
    build(): Parcelamento {
      return Parcelamento.criar({ ...props });
    },
  };
}
