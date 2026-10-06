/** Falha ao baixar um arquivo do Telegram. A mensagem nunca contém a URL (ela carrega o token). */
export class DownloadFalhouError extends Error {
  constructor() {
    super('Falha ao baixar o arquivo');
    this.name = 'DownloadFalhouError';
  }
}

export const TIMEOUT_DOWNLOAD_MS = 10_000;

// ponytail: lê o corpo inteiro antes de checar o tamanho; o limite de 1 MB e o content-length mantêm isso barato. Streaming se o limite crescer.
export async function baixarArquivo(
  url: string,
  opcoes: {
    timeoutMs: number;
    maxBytes: number;
    fetch?: typeof globalThis.fetch;
  },
): Promise<Buffer> {
  const fetch = opcoes.fetch ?? globalThis.fetch;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      signal: AbortSignal.timeout(opcoes.timeoutMs),
      // A URL carrega o token: nunca seguir redirecionamento.
      redirect: 'error',
    });
  } catch {
    throw new DownloadFalhouError();
  }
  if (!resposta.ok) throw new DownloadFalhouError();
  const declarado = Number(resposta.headers.get('content-length') ?? 0);
  if (declarado > opcoes.maxBytes) throw new DownloadFalhouError();
  let corpo: ArrayBuffer;
  try {
    corpo = await resposta.arrayBuffer();
  } catch {
    throw new DownloadFalhouError();
  }
  if (corpo.byteLength > opcoes.maxBytes) throw new DownloadFalhouError();
  return Buffer.from(corpo);
}
