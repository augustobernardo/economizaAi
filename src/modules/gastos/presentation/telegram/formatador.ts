import {
  NenhumGastoEncontradoError,
  NenhumGastoNoPeriodoError,
  NenhumGastoRegistradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import { ROTULOS_CATEGORIA, type Categoria } from '../../domain/categoria.js';
import { somarDias } from '../../domain/data-civil.js';
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
import { plural, type ResumoDeGastos } from '../../domain/resumo.js';
import {
  BYTES_POR_MB,
  MAX_BYTES_AUDIO,
  MAX_CARACTERES_TEXTO,
  MAX_DURACAO_AUDIO_S,
} from '../limites.js';
import { DownloadFalhouError } from './download.js';
import { escaparHtml } from './html.js';

export const EMOJI_CATEGORIA: Record<Categoria, string> = {
  alimentacao: '🍔',
  mercado: '🛒',
  transporte: '🚗',
  moradia: '🏠',
  saude: '💊',
  lazer: '🎉',
  educacao: '📚',
  assinaturas: '🔁',
  vestuario: '👕',
  outros: '📦',
};

const rotulo = (c: Categoria): string => {
  const r = ROTULOS_CATEGORIA[c];
  return r.charAt(0).toUpperCase() + r.slice(1);
};
const comEmoji = (c: Categoria): string => `${EMOJI_CATEGORIA[c]} ${rotulo(c)}`;

/** `YYYY-MM-DD` → `dd/MM`, sem `Date` (evita erro de fuso). */
function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export function dataRelativa(data: string, hoje: string): string {
  if (data === hoje) return `Hoje, ${diaMes(data)}`;
  if (data === somarDias(hoje, -1)) return `Ontem, ${diaMes(data)}`;
  return diaMes(data);
}

/** "outubro/2026" para mês; dia e intervalo usam `descrever()`. */
function nomeDoPeriodo(periodo: Periodo): string {
  return periodo.tipo === 'mes'
    ? periodo.descrever().replace(' de ', '/')
    : periodo.descrever();
}

const EXEMPLOS = [
  '• <i>gastei 30 no almoço</i>',
  '• <i>uber 18,50 ontem</i>',
  '• <i>mercado 120 e farmácia 40</i>',
];

export const MENSAGEM_NENHUM_GASTO = [
  '🔍 Não encontrei nenhum gasto nessa mensagem.',
  '',
  'Tente algo como:',
  ...EXEMPLOS.slice(0, 2),
].join('\n');

export const TEXTO_START = [
  '👋 Olá! Eu sou o <b>Eco</b>, seu assistente de gastos.',
  '',
  'Me conte o que você gastou, por texto ou áudio, que eu registro tudo pra você. 💸',
  '',
  '<b>✨ O que eu faço</b>',
  '✍️ Registro gastos enviados por texto',
  '🎙️ Entendo mensagens de áudio',
  '🧠 Identifico valor, categoria e data sozinho',
  '🧾 Registro vários gastos numa mensagem só',
  '↩️ Desfaço um registro com um toque',
  '📈 Resumo o mês por categoria',
  '📊 Exporto as movimentações em CSV e Markdown',
  '',
  '<b>💬 Experimente mandar</b>',
  ...EXEMPLOS,
  '',
  '<b>⚙️ Comandos</b>',
  '/ajuda: exemplos e dicas',
  '/resumo: resumo do mês',
  '/ultimos: últimos gastos',
  '/exportar: exportar o mês',
  '',
  '🔒 Só respondo a você, e seus registros ficam guardados no seu próprio servidor.',
].join('\n');

export const TEXTO_AJUDA = [
  '💡 <b>Como usar o Eco</b>',
  '',
  '<b>Registrar</b>',
  ...EXEMPLOS,
  '• <i>anteontem cinquenta reais de farmácia</i>',
  '• <i>2 cafés de 8 na sexta</i>',
  '',
  '<b>Perguntar</b>',
  '• <i>quanto gastei em setembro?</i>',
  '• <i>exporta meus gastos de agosto</i>',
  '• <i>quais foram meus últimos gastos?</i>',
  '',
  '<b>⚙️ Comandos</b>',
  '/resumo: mês atual, ou <code>/resumo 2026-09</code> para outro mês',
  '/ultimos: últimos gastos',
  '/exportar: exportar o mês',
  '',
  '↩️ O botão Desfazer vale por 1 hora.',
].join('\n');

export const COMANDOS = [
  { command: 'start', description: 'Apresentação do Eco' },
  { command: 'ajuda', description: 'Exemplos e dicas' },
  { command: 'resumo', description: 'Resumo do mês (ou /resumo 2026-09)' },
  { command: 'ultimos', description: 'Últimos gastos registrados' },
  { command: 'exportar', description: 'Exportar o mês em CSV e Markdown' },
];

export const MENSAGEM_TEXTO_LONGO = `✂️ Mensagem muito longa (máximo de ${MAX_CARACTERES_TEXTO} caracteres). Pode resumir?`;
export const MENSAGEM_AUDIO_LONGO = `🎧 Esse áudio é longo demais. Mande um de até ${MAX_DURACAO_AUDIO_S} segundos.`;
export const MENSAGEM_AUDIO_GRANDE = `🎧 Esse áudio é grande demais (máximo de ${MAX_BYTES_AUDIO / BYTES_POR_MB} MB).`;
export const MENSAGEM_NAO_SUPORTADO =
  '🙈 Por enquanto só entendo mensagens de texto e de voz.';
export const MENSAGEM_COMANDO_DESCONHECIDO =
  '❓ Não conheço esse comando. Veja /ajuda';
export const MENSAGEM_RATE_LIMIT =
  '⏳ Calma! Muitas mensagens seguidas. Espere um minuto.';
export const MENSAGEM_ESCOLHER_MES_EXPORTAR =
  '📊 <b>Exportar movimentações</b>\nQual mês você quer exportar?';

export function formatarRegistro(
  gastos: readonly Gasto[],
  hoje: string,
): string {
  const [unico] = gastos;
  if (unico && gastos.length === 1) {
    return [
      '✅ <b>Gasto registrado!</b>',
      '',
      comEmoji(unico.categoria),
      `💰 ${unico.valor.formatar()}`,
      `📝 ${escaparHtml(unico.descricao)}`,
      `📅 ${dataRelativa(unico.dataGasto, hoje)}`,
    ].join('\n');
  }
  const total = Dinheiro.deCentavos(
    gastos.reduce((soma, g) => soma + g.valor.centavos, 0),
  );
  return [
    `✅ <b>${gastos.length} gastos registrados!</b>`,
    '',
    ...gastos.flatMap((g) => [
      `${comEmoji(g.categoria)}: ${g.valor.formatar()}`,
      `     ${escaparHtml(g.descricao)} · ${dataRelativa(g.dataGasto, hoje)}`,
    ]),
    '',
    `💵 <b>Total: ${total.formatar()}</b>`,
  ].join('\n');
}

/** Mantém a legenda do documento dentro de 1024 caracteres (limite do Telegram). */
const MAX_TRANSCRICAO = 500;

/** Prefixa o HTML com a transcrição (cortada e escapada); vazia não gera a linha. */
export function comTranscricao(transcricao: string, html: string): string {
  if (!transcricao) return html;
  const letras = Array.from(transcricao);
  const curta =
    letras.length > MAX_TRANSCRICAO
      ? `${letras.slice(0, MAX_TRANSCRICAO - 1).join('')}…`
      : transcricao;
  return `🎙️ Entendi: "${escaparHtml(curta)}"\n\n${html}`;
}

export function formatarSemGastoNoAudio(transcricao: string): string {
  return comTranscricao(transcricao, MENSAGEM_NENHUM_GASTO);
}

export function formatarResumo(
  periodo: Periodo,
  resumo: ResumoDeGastos,
): string {
  const { maiorGasto: m } = resumo;
  return [
    `📊 <b>Resumo de ${nomeDoPeriodo(periodo)}</b>`,
    `💵 Total: ${resumo.total.formatar()} · ${plural(resumo.quantidade, 'registro', 'registros')}`,
    '',
    ...resumo.porCategoria.map(
      (c) =>
        `${comEmoji(c.categoria)}: ${c.total.formatar()} (${c.percentual}%)`,
    ),
    '',
    `🏆 Maior gasto: ${m.valor.formatar()} · ${rotulo(m.categoria)} · ${diaMes(m.dataGasto)}`,
  ].join('\n');
}

export function formatarUltimos(
  gastos: readonly Gasto[],
  hoje: string,
): string {
  const titulo =
    gastos.length === 1
      ? '🧾 <b>Último gasto</b>'
      : `🧾 <b>Últimos ${gastos.length} gastos</b>`;
  return [
    titulo,
    '',
    ...gastos.map(
      (g) =>
        `${EMOJI_CATEGORIA[g.categoria]} ${dataRelativa(g.dataGasto, hoje)} · ${g.valor.formatar()} · ${escaparHtml(g.descricao)}`,
    ),
  ].join('\n');
}

export function legendaExportacao(
  periodo: Periodo,
  quantidade: number,
): string {
  return `📎 Aqui está o seu arquivo de <b>${nomeDoPeriodo(periodo)}</b> (${plural(quantidade, 'gasto', 'gastos')}).`;
}

/** O texto original vem de `message.text` (cru): é escapado antes de voltar como HTML. */
export function formatarDesfeito(textoOriginal: string): string {
  const original = escaparHtml(textoOriginal.trim());
  return [original, '↩️ <b>Pronto, desfiz o registro.</b>']
    .filter(Boolean)
    .join('\n\n');
}

const MENSAGENS: [new (...args: never[]) => Error, string][] = [
  [NenhumGastoEncontradoError, MENSAGEM_NENHUM_GASTO],
  [
    ProvedorIndisponivelError,
    '😵 Estou com dificuldade para entender agora. Tente em alguns minutos.',
  ],
  [RespostaInvalidaDaIaError, '🤔 Não consegui entender. Pode reformular?'],
  [
    ValorAcimaDoTetoError,
    '⚠️ Esse valor parece alto demais. O limite é R$ 50.000,00 por gasto.',
  ],
  [ValorInvalidoError, '⚠️ Não consegui entender o valor.'],
  [
    DataFuturaError,
    '📅 Essa data não parece certa: o gasto não pode ser no futuro.',
  ],
  [
    DataForaDaJanelaError,
    '📅 Essa data não parece certa: só registro gastos de até 1 ano atrás.',
  ],
  [DataInvalidaError, '📅 Essa data não parece certa.'],
  [DescricaoVaziaError, '📝 Faltou dizer com o que foi o gasto.'],
  [PeriodoFuturoError, '📅 O período informado está no futuro.'],
  [PeriodoInvertidoError, '📅 A data inicial é depois da data final.'],
  [PeriodoLongoDemaisError, '📅 O intervalo máximo é de 1 ano.'],
  [NenhumGastoRegistradoError, '🧾 Você ainda não registrou nenhum gasto.'],
  [DownloadFalhouError, '🎧 Não consegui baixar o áudio. Tente de novo.'],
];

export const MENSAGEM_ERRO_INESPERADO =
  '🛠️ Algo deu errado do meu lado. Já registrei o problema.';

/** Mensagem amigável (HTML); nunca expõe a mensagem interna do erro. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof NenhumGastoNoPeriodoError) {
    const { periodo } = erro;
    if (periodo.tipo === 'mes')
      return `🗓️ Nenhum gasto registrado em <b>${nomeDoPeriodo(periodo)}</b>.`;
    const onde =
      periodo.tipo === 'dia' ? 'na data informada' : 'no intervalo informado';
    return `🗓️ Nenhum gasto registrado ${onde} (<b>${periodo.descrever()}</b>).`;
  }
  const par = MENSAGENS.find(([Classe]) => erro instanceof Classe);
  return par ? par[1] : MENSAGEM_ERRO_INESPERADO;
}
