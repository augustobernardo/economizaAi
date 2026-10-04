import { describe, expect, it, vi } from 'vitest';
import { baixarArquivo, DownloadFalhouError } from './download.js';

const URL_SECRETA =
  'https://api.telegram.org/file/bot123:SEGREDO/voice/file_1.oga';
const OPCOES = { timeoutMs: 1000, maxBytes: 10 };

function fetchQueResponde(corpo: Uint8Array, init: ResponseInit = {}) {
  return vi.fn(
    async () => new Response(corpo as BodyInit, init),
  ) as unknown as typeof fetch;
}

describe('baixarArquivo', () => {
  it('devolve o conteúdo como Buffer', async () => {
    const fetch = fetchQueResponde(new Uint8Array([1, 2, 3]));
    const buffer = await baixarArquivo(URL_SECRETA, { ...OPCOES, fetch });
    expect([...buffer]).toEqual([1, 2, 3]);
  });

  it('passa um AbortSignal para o fetch', async () => {
    const fetch = fetchQueResponde(new Uint8Array([1]));
    await baixarArquivo(URL_SECRETA, { ...OPCOES, fetch });
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('status não-OK → DownloadFalhouError', async () => {
    const fetch = fetchQueResponde(new Uint8Array(), { status: 404 });
    await expect(
      baixarArquivo(URL_SECRETA, { ...OPCOES, fetch }),
    ).rejects.toBeInstanceOf(DownloadFalhouError);
  });

  it('erro de rede ou timeout → DownloadFalhouError', async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }) as unknown as typeof globalThis.fetch;
    await expect(
      baixarArquivo(URL_SECRETA, { ...OPCOES, fetch }),
    ).rejects.toBeInstanceOf(DownloadFalhouError);
  });

  it('content-length acima do limite → DownloadFalhouError', async () => {
    const fetch = fetchQueResponde(new Uint8Array(5), {
      headers: { 'content-length': '11' },
    });
    await expect(
      baixarArquivo(URL_SECRETA, { ...OPCOES, fetch }),
    ).rejects.toBeInstanceOf(DownloadFalhouError);
  });

  it('corpo acima do limite sem content-length → DownloadFalhouError', async () => {
    const fetch = fetchQueResponde(new Uint8Array(11));
    await expect(
      baixarArquivo(URL_SECRETA, { ...OPCOES, fetch }),
    ).rejects.toBeInstanceOf(DownloadFalhouError);
  });

  it('a mensagem do erro nunca contém a URL', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError(`fetch failed ${URL_SECRETA}`);
    }) as unknown as typeof globalThis.fetch;
    const erro = await baixarArquivo(URL_SECRETA, { ...OPCOES, fetch }).catch(
      (e: unknown) => e,
    );
    expect(String((erro as Error).message)).not.toContain('SEGREDO');
    expect((erro as Error).cause).toBeUndefined();
  });
});
