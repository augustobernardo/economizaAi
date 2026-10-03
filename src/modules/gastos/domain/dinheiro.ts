import { ValorInvalidoError } from './errors.js';

/** `'R$ 12,30'`, `'1.234,56'`, `'50,90'` ou `'50'` (reais inteiros). */
const PADRAO_TEXTO_BRASILEIRO =
  /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?$/;

/** Valor monetário imutável, armazenado em centavos inteiros. */
export class Dinheiro {
  private constructor(public readonly centavos: number) {}

  static deCentavos(centavos: number): Dinheiro {
    if (!Number.isSafeInteger(centavos) || centavos <= 0) {
      throw new ValorInvalidoError(`Valor em centavos inválido: ${centavos}`);
    }
    return new Dinheiro(centavos);
  }

  static deReais(reais: number): Dinheiro {
    if (!Number.isFinite(reais) || reais <= 0) {
      throw new ValorInvalidoError(`Valor em reais inválido: ${reais}`);
    }
    // Desloca a vírgula pela notação decimal (`1.005e2` = 100.5), não por
    // multiplicação de float (`1.005 * 100` = 100.49999999999999).
    return Dinheiro.deCentavos(Math.round(Number(`${reais}e2`)));
  }

  static deTexto(texto: string): Dinheiro {
    const resultado = PADRAO_TEXTO_BRASILEIRO.exec(texto.trim());
    if (!resultado) {
      throw new ValorInvalidoError(`Texto de valor inválido: "${texto}"`);
    }

    const [, parteInteira, parteDecimal] = resultado;
    const reais = Number.parseInt(parteInteira.replaceAll('.', ''), 10);
    const centavosDecimais = parteDecimal
      ? Number.parseInt(parteDecimal, 10)
      : 0;

    return Dinheiro.deCentavos(reais * 100 + centavosDecimais);
  }

  somar(outro: Dinheiro): Dinheiro {
    return Dinheiro.deCentavos(this.centavos + outro.centavos);
  }

  equals(outro: Dinheiro): boolean {
    return this.centavos === outro.centavos;
  }

  formatar(): string {
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(this.centavos / 100);
    // O Intl usa NBSP (U+00A0) entre "R$" e o número; normalizamos para espaço comum.
    return valorFormatado.replace(' ', ' ');
  }
}
