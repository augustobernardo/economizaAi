import {
  NenhumGastoEncontradoError,
  ProvedorIndisponivelError,
  RespostaInvalidaDaIaError,
} from '../../application/errors.js';
import type { Categoria } from '../../domain/categoria.js';
import { Dinheiro } from '../../domain/dinheiro.js';
import {
  DataForaDaJanelaError,
  DataFuturaError,
  DataInvalidaError,
  DescricaoVaziaError,
  ValorAcimaDoTetoError,
  ValorInvalidoError,
} from '../../domain/errors.js';
import type { Gasto } from '../../domain/gasto.js';
import { MAX_CARACTERES_TEXTO, MAX_DURACAO_AUDIO_S } from '../limites.js';
import { DownloadFalhouError } from './download.js';

const ROTULOS: Record<Categoria, string> = {
  alimentacao: 'alimentação',
  mercado: 'mercado',
  transporte: 'transporte',
  moradia: 'moradia',
  saude: 'saúde',
  lazer: 'lazer',
  educacao: 'educação',
  assinaturas: 'assinaturas',
  vestuario: 'vestuário',
  outros: 'outros',
};

export const TEXTO_AJUDA = [
  'Me mande seus gastos em texto, por exemplo:',
  '• "gastei 32,50 de uber"',
  '• "ontem 18 num açaí e 120 no mercado"',
  '• ou mande um áudio falando o gasto',
  '',
  'Depois de registrar, o botão ↩️ Desfazer vale por 1 hora.',
].join('\n');

export const TEXTO_START = `Olá! Eu registro seus gastos.\n\n${TEXTO_AJUDA}`;
export const MENSAGEM_TEXTO_LONGO = `Mensagem muito longa (máximo de ${MAX_CARACTERES_TEXTO} caracteres).`;
export const MENSAGEM_AUDIO_LONGO = `Áudio muito longo (máximo de ${MAX_DURACAO_AUDIO_S} s).`;
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
      `• ${g.valor.formatar()} — ${g.descricao} (${ROTULOS[g.categoria]}) — ${diaMes(g.dataGasto)}`,
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
  return `🎙️ "${transcricao}"\n\n${formatarRegistro(gastos)}`;
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
  [DownloadFalhouError, 'Não consegui baixar o áudio. Tente de novo.'],
];

/** Mensagem amigável; nunca expõe a mensagem interna do erro. */
export function mensagemDeErro(erro: unknown): string {
  const par = MENSAGENS.find(([Classe]) => erro instanceof Classe);
  return par ? par[1] : 'Erro inesperado. Tente de novo.';
}
