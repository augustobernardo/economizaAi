const MS_POR_DIA = 86_400_000;

/** Data civil `YYYY-MM-DD` de um instante, no fuso de São Paulo. */
export function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(agora);
}

/** Valida o formato `YYYY-MM-DD` e que a data é um dia real do calendário. */
export function ehDataCivilValida(data: string): boolean {
  const resultado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!resultado) return false;

  const ano = Number(resultado[1]);
  const mes = Number(resultado[2]);
  const dia = Number(resultado[3]);
  const real = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    real.getUTCFullYear() === ano &&
    real.getUTCMonth() === mes - 1 &&
    real.getUTCDate() === dia
  );
}

/** `[ano, mes, dia]` de uma data `YYYY-MM-DD` já validada. */
export function partesDaData(data: string): [number, number, number] {
  const [ano, mes, dia] = data.split('-').map(Number);
  return [ano!, mes!, dia!];
}

function paraUTC(data: string): number {
  const [ano, mes, dia] = partesDaData(data);
  return Date.UTC(ano, mes - 1, dia);
}

function formatarUTC(instante: number): string {
  const data = new Date(instante);
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function somarDias(data: string, dias: number): string {
  return formatarUTC(paraUTC(data) + dias * MS_POR_DIA);
}

/** Mesmo dia/mês `anos` antes (29/02 vira 01/03 se o ano alvo não é bissexto). */
export function subtrairAnos(data: string, anos: number): string {
  const [ano, mes, dia] = partesDaData(data);
  return formatarUTC(Date.UTC(ano - anos, mes - 1, dia));
}

/** `fim - inicio`, em dias. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((paraUTC(fim) - paraUTC(inicio)) / MS_POR_DIA);
}

/** `mes` de 1 a 12. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** `2026-10-04` → `04/10/2026`. */
export function formatarDataBr(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}
