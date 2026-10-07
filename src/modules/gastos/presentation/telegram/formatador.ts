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
import { escaparHtml, html, juntarHtml, type Html } from './html.js';

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

const EXEMPLOS: readonly Html[] = [
  html`• <i>gastei 30 no almoço</i>`,
  html`• <i>uber 18,50 ontem</i>`,
  html`• <i>mercado 120 e farmácia 40</i>`,
];

export const MENSAGEM_NENHUM_GASTO = juntarHtml([
  html`🔍 Não encontrei nenhum gasto nessa mensagem.`,
  html``,
  html`Tente algo como:`,
  ...EXEMPLOS.slice(0, 2),
]);

export const TEXTO_START = juntarHtml([
  html`👋 Olá! Eu sou o <b>Eco</b>, seu assistente de gastos.`,
  html``,
  html`Me conte o que você gastou, por texto ou áudio, que eu registro tudo pra você. 💸`,
  html``,
  html`<b>✨ O que eu faço</b>`,
  html`✍️ Registro gastos enviados por texto`,
  html`🎙️ Entendo mensagens de áudio`,
  html`🧠 Identifico valor, categoria e data sozinho`,
  html`🧾 Registro vários gastos numa mensagem só`,
  html`↩️ Desfaço um registro com um toque`,
  html`📈 Resumo o mês por categoria`,
  html`📊 Exporto as movimentações em CSV e Markdown`,
  html``,
  html`<b>💬 Experimente mandar</b>`,
  ...EXEMPLOS,
  html``,
  html`<b>⚙️ Comandos</b>`,
  html`/ajuda: exemplos e dicas`,
  html`/resumo: resumo do mês`,
  html`/ultimos: últimos gastos`,
  html`/exportar: exportar o mês`,
  html``,
  html`🔒 Só respondo a você, e seus registros ficam guardados no seu próprio servidor.`,
]);

export const TEXTO_AJUDA = juntarHtml([
  html`💡 <b>Como usar o Eco</b>`,
  html``,
  html`<b>Registrar</b>`,
  ...EXEMPLOS,
  html`• <i>anteontem cinquenta reais de farmácia</i>`,
  html`• <i>2 cafés de 8 na sexta</i>`,
  html``,
  html`<b>Perguntar</b>`,
  html`• <i>quanto gastei em setembro?</i>`,
  html`• <i>exporta meus gastos de agosto</i>`,
  html`• <i>quais foram meus últimos gastos?</i>`,
  html``,
  html`<b>⚙️ Comandos</b>`,
  html`/resumo: mês atual, ou <code>/resumo 2026-09</code> para outro mês`,
  html`/ultimos: últimos gastos`,
  html`/exportar: exportar o mês`,
  html``,
  html`↩️ O botão Desfazer vale por 1 hora.`,
]);

/** Menu do Telegram (texto puro, não é HTML). */
export const COMANDOS = [
  { command: 'start', description: 'Apresentação do Eco' },
  { command: 'ajuda', description: 'Exemplos e dicas' },
  { command: 'resumo', description: 'Resumo do mês (ou /resumo 2026-09)' },
  { command: 'ultimos', description: 'Últimos gastos registrados' },
  { command: 'exportar', description: 'Exportar o mês em CSV e Markdown' },
];

export const MENSAGEM_TEXTO_LONGO = html`✂️ Mensagem muito longa (máximo de ${MAX_CARACTERES_TEXTO} caracteres). Pode resumir?`;
export const MENSAGEM_AUDIO_LONGO = html`🎧 Esse áudio é longo demais. Mande um de até ${MAX_DURACAO_AUDIO_S} segundos.`;
export const MENSAGEM_AUDIO_GRANDE = html`🎧 Esse áudio é grande demais (máximo de ${MAX_BYTES_AUDIO / BYTES_POR_MB} MB).`;
export const MENSAGEM_NAO_SUPORTADO = html`🙈 Por enquanto só entendo mensagens de texto e de voz.`;
export const MENSAGEM_COMANDO_DESCONHECIDO = html`❓ Não conheço esse comando. Veja /ajuda`;
/** Popup do botão barrado (texto puro, sem HTML); o chat recebe a versão `Html`. */
export const POPUP_RATE_LIMIT =
  '⏳ Calma! Muitas mensagens seguidas. Espere um minuto.';
export const MENSAGEM_RATE_LIMIT = html`${POPUP_RATE_LIMIT}`;
export const MENSAGEM_ESCOLHER_MES_EXPORTAR = html`📊 <b>Exportar movimentações</b>\nQual mês você quer exportar?`;

export function formatarRegistro(gastos: readonly Gasto[], hoje: string): Html {
  const [unico] = gastos;
  if (unico && gastos.length === 1) {
    return juntarHtml([
      html`✅ <b>Gasto registrado!</b>`,
      html``,
      html`${comEmoji(unico.categoria)}`,
      html`💰 ${unico.valor.formatar()}`,
      html`📝 ${unico.descricao}`,
      html`📅 ${dataRelativa(unico.dataGasto, hoje)}`,
    ]);
  }
  const total = Dinheiro.deCentavos(
    gastos.reduce((soma, g) => soma + g.valor.centavos, 0),
  );
  return juntarHtml([
    html`✅ <b>${gastos.length} gastos registrados!</b>`,
    html``,
    ...gastos.flatMap((g) => [
      html`${comEmoji(g.categoria)}: ${g.valor.formatar()}`,
      html`     ${g.descricao} · ${dataRelativa(g.dataGasto, hoje)}`,
    ]),
    html``,
    html`💵 <b>Total: ${total.formatar()}</b>`,
  ]);
}

/** Mantém a legenda do documento dentro de 1024 caracteres (limite do Telegram). */
const MAX_TRANSCRICAO = 500;

/** Prefixa o HTML com a transcrição (cortada e escapada); vazia não gera a linha. */
export function comTranscricao(transcricao: string, corpo: Html): Html {
  if (!transcricao) return corpo;
  const letras = Array.from(transcricao);
  const curta =
    letras.length > MAX_TRANSCRICAO
      ? `${letras.slice(0, MAX_TRANSCRICAO - 1).join('')}…`
      : transcricao;
  return html`🎙️ Entendi: "${curta}"\n\n${[corpo]}`;
}

export function formatarSemGastoNoAudio(transcricao: string): Html {
  return comTranscricao(transcricao, MENSAGEM_NENHUM_GASTO);
}

export function formatarResumo(periodo: Periodo, resumo: ResumoDeGastos): Html {
  const { maiorGasto: m } = resumo;
  return juntarHtml([
    html`📊 <b>Resumo de ${nomeDoPeriodo(periodo)}</b>`,
    html`💵 Total: ${resumo.total.formatar()} · ${plural(resumo.quantidade, 'registro', 'registros')}`,
    html``,
    ...resumo.porCategoria.map(
      (c) =>
        html`${comEmoji(c.categoria)}: ${c.total.formatar()} (${c.percentual}%)`,
    ),
    html``,
    html`🏆 Maior gasto: ${m.valor.formatar()} · ${rotulo(m.categoria)} · ${diaMes(m.dataGasto)}`,
  ]);
}

export function formatarUltimos(gastos: readonly Gasto[], hoje: string): Html {
  const titulo =
    gastos.length === 1
      ? html`🧾 <b>Último gasto</b>`
      : html`🧾 <b>Últimos ${gastos.length} gastos</b>`;
  return juntarHtml([
    titulo,
    html``,
    ...gastos.map(
      (g) =>
        html`${EMOJI_CATEGORIA[g.categoria]} ${dataRelativa(g.dataGasto, hoje)} · ${g.valor.formatar()} · ${g.descricao}`,
    ),
  ]);
}

export function legendaExportacao(periodo: Periodo, quantidade: number): Html {
  return html`📎 Aqui está o seu arquivo de <b>${nomeDoPeriodo(periodo)}</b> (${plural(quantidade, 'gasto', 'gastos')}).`;
}

/** O texto original vem de `message.text` (cru): é escapado antes de voltar como HTML. */
export function formatarDesfeito(textoOriginal: string): Html {
  const original = escaparHtml(textoOriginal.trim());
  return juntarHtml(
    [original, html`↩️ <b>Pronto, desfiz o registro.</b>`].filter(Boolean),
    '\n\n',
  );
}

const MENSAGENS: [new (...args: never[]) => Error, Html][] = [
  [NenhumGastoEncontradoError, MENSAGEM_NENHUM_GASTO],
  [
    ProvedorIndisponivelError,
    html`😵 Estou com dificuldade para entender agora. Tente em alguns minutos.`,
  ],
  [RespostaInvalidaDaIaError, html`🤔 Não consegui entender. Pode reformular?`],
  [
    ValorAcimaDoTetoError,
    html`⚠️ Esse valor parece alto demais. O limite é R$ 50.000,00 por gasto.`,
  ],
  [ValorInvalidoError, html`⚠️ Não consegui entender o valor.`],
  [
    DataFuturaError,
    html`📅 Essa data não parece certa: o gasto não pode ser no futuro.`,
  ],
  [
    DataForaDaJanelaError,
    html`📅 Essa data não parece certa: só registro gastos de até 1 ano atrás.`,
  ],
  [DataInvalidaError, html`📅 Essa data não parece certa.`],
  [DescricaoVaziaError, html`📝 Faltou dizer com o que foi o gasto.`],
  [PeriodoFuturoError, html`📅 O período informado está no futuro.`],
  [PeriodoInvertidoError, html`📅 A data inicial é depois da data final.`],
  [PeriodoLongoDemaisError, html`📅 O intervalo máximo é de 1 ano.`],
  [NenhumGastoRegistradoError, html`🧾 Você ainda não registrou nenhum gasto.`],
  [DownloadFalhouError, html`🎧 Não consegui baixar o áudio. Tente de novo.`],
];

/** Popup do botão (texto puro, sem HTML): o Desfazer só falha por erro inesperado. */
export const MENSAGEM_FALHA_AO_DESFAZER =
  '🛠️ Não consegui desfazer agora. Tente de novo.';

export const MENSAGEM_ERRO_INESPERADO = html`🛠️ Algo deu errado do meu lado. Já registrei o problema.`;

/** Mensagem amigável (HTML); nunca expõe a mensagem interna do erro. */
export function mensagemDeErro(erro: unknown): Html {
  if (erro instanceof NenhumGastoNoPeriodoError) {
    const { periodo } = erro;
    if (periodo.tipo === 'mes')
      return html`🗓️ Nenhum gasto registrado em <b>${nomeDoPeriodo(periodo)}</b>.`;
    const onde =
      periodo.tipo === 'dia' ? 'na data informada' : 'no intervalo informado';
    return html`🗓️ Nenhum gasto registrado ${onde} (<b>${periodo.descrever()}</b>).`;
  }
  const par = MENSAGENS.find(([Classe]) => erro instanceof Classe);
  return par ? par[1] : MENSAGEM_ERRO_INESPERADO;
}
