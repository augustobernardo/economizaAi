import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { ROTULOS_CATEGORIA } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  PeriodoFuturoError,
  PeriodoInvertidoError,
  PeriodoLongoDemaisError,
  ValorAcimaDoTetoError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Periodo } from '../../domain/periodo.js';
import type { ResumoDeGastos } from '../../domain/resumo.js';
import {
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import { DownloadFalhouError } from './download.js';

export const TEXTO_AJUDA = [
  'Me mande seus gastos em texto ou áudio, por exemplo:',
  '• "gastei 32,50 de uber"',
  '• "ontem 18 num açaí e 120 no mercado"',
  '',
  'Também entendo pedidos como:',
  '• "exporta meus gastos de agosto"',
  '• "quanto gastei em setembro?"',
  '• "quais foram meus últimos gastos?"',
  '',
  'Comandos: /exportar, /resumo, /ultimos, /ajuda',
  'O botão ↩️ Desfazer vale por 1 hora.',
].join('\n');

export const TEXTO_START = `Olá! Eu registro seus gastos.\n\n${TEXTO_AJUDA}`;
export const MENSAGEM_TEXTO_LONGO = `Mensagem muito longa (máximo de ${MAX_CARACTERES_TEXTO} caracteres).`;
export const MENSAGEM_AUDIO_LONGO = `Áudio muito longo (máximo de ${MAX_DURACAO_AUDIO_S} s).`;
export const MENSAGEM_AUDIO_GRANDE = `Áudio muito grande (máximo de ${MAX_BYTES_AUDIO / 1_048_576} MB).`;
export const MENSAGEM_NAO_SUPORTADO =
  'Por enquanto só entendo mensagens de texto e de voz.';

/** `YYYY-MM-DD` → `dd/MM`, sem `Date` (evita erro de fuso). */
function diaMes(dataGasto: string): string {
  const [, mes, dia] = dataGasto.split('-');
  return `${dia}/${mes}`;
}

/** Resposta de sucesso em texto puro (enviada sem parse_mode). */
export function formatarRegistro(gastos: readonly Gasto[]): string {
  const titulo =
    gastos.length === 1
      ? '✅ 1 gasto registrado'
      : `✅ ${gastos.length} gastos registrados`;
  const linhas = gastos.map(
    (g) =>
      `• ${g.valor.formatar()} — ${g.descricao} (${ROTULOS_CATEGORIA[g.categoria]}) — ${diaMes(g.dataGasto)}`,
  );
  const total = Dinheiro.deCentavos(
    gastos.reduce((soma, g) => soma + g.valor.centavos, 0),
  );
  return [titulo, ...linhas, `Total: ${total.formatar()}`].join('\n');
}

export function formatarRegistroDeAudio(
  transcricao: string,
  gastos: readonly Gasto[],
): string {
  return comTranscricao(transcricao, formatarRegistro(gastos));
}

/** Prefixa o texto com a transcrição; transcrição vazia não gera a linha. */
export function comTranscricao(transcricao: string, texto: string): string {
  return transcricao ? `🎙️ "${transcricao}"\n\n${texto}` : texto;
}

const plural = (n: number, singular: string, pluralStr: string) =>
  n === 1 ? `1 ${singular}` : `${n} ${pluralStr}`;

export function formatarResumo(
  periodo: Periodo,
  resumo: ResumoDeGastos,
): string {
  const { maiorGasto: m } = resumo;
  return [
    `📊 Resumo — ${periodo.descrever()}`,
    `Total: ${resumo.total.formatar()} (${plural(resumo.quantidade, 'gasto', 'gastos')})`,
    ...resumo.porCategoria.map(
      (c) =>
        `• ${ROTULOS_CATEGORIA[c.categoria]}: ${c.total.formatar()} (${String(c.percentual).replace('.', ',')}%)`,
    ),
    `Maior gasto: ${m.valor.formatar()} — ${m.descricao} (${ROTULOS_CATEGORIA[m.categoria]}) — ${diaMes(m.dataGasto)}`,
  ].join('\n');
}

export function formatarUltimos(gastos: readonly Gasto[]): string {
  const titulo =
    gastos.length === 1
      ? '🧾 Último gasto'
      : `🧾 Últimos ${gastos.length} gastos`;
  return [
    titulo,
    ...gastos.map(
      (g) =>
        `• ${diaMes(g.dataGasto)} — ${g.valor.formatar()} — ${g.descricao} (${ROTULOS_CATEGORIA[g.categoria]})`,
    ),
  ].join('\n');
}

export function legendaExportacao(
  periodo: Periodo,
  quantidade: number,
): string {
  return `📁 ${plural(quantidade, 'gasto', 'gastos')} — ${periodo.descrever()}`;
}

export function formatarSemGastoNoAudio(transcricao: string): string {
  return `🎙️ Ouvi: "${transcricao}"\nNão encontrei nenhum gasto.`;
}

const MENSAGENS: [new (...args: never[]) => Error, string][] = [
  [
    NenhumGastoEncontradoError,
    'Não encontrei nenhum gasto. Exemplo: "gastei 25 no almoço"',
  ],
  [
    ProvedorIndisponivelError,
    'A IA está indisponível agora. Tente de novo em instantes.',
  ],
  [RespostaInvalidaDaIaError, 'Não consegui entender. Pode reformular?'],
  [ValorAcimaDoTetoError, 'Valor acima do limite de R$ 50.000,00 por gasto.'],
  [ValorInvalidoError, 'Não consegui entender o valor.'],
  [DataFuturaError, 'A data do gasto não pode ser no futuro.'],
  [DataForaDaJanelaError, 'Só registro gastos de até 1 ano atrás.'],
  [DataInvalidaError, 'Não consegui entender a data.'],
  [DescricaoVaziaError, 'Faltou dizer com o que foi o gasto.'],
  [PeriodoFuturoError, 'O período informado está no futuro.'],
  [PeriodoInvertidoError, 'A data inicial é depois da data final.'],
  [PeriodoLongoDemaisError, 'O intervalo máximo é de 1 ano.'],
  [NenhumGastoRegistradoError, 'Você ainda não registrou nenhum gasto.'],
  [DownloadFalhouError, 'Não consegui baixar o áudio. Tente de novo.'],
];

/** Mensagem amigável; nunca expõe a mensagem interna do erro. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof NenhumGastoNoPeriodoError) {
    const { periodo } = erro;
    const onde = {
      dia: 'na data informada',
      mes: 'no mês informado',
      intervalo: 'no intervalo informado',
    }[periodo.tipo];
    return `Nenhum gasto encontrado ${onde} (${periodo.descrever()}).`;
  }
  const par = MENSAGENS.find(([Classe]) => erro instanceof Classe);
  return par ? par[1] : 'Erro inesperado. Tente de novo.';
}
