import { describe, expect, it, vi } from 'vitest';
import { comHtml, escaparHtml, semTags } from './html.js';

describe('semTags', () => {
  it('tira as tags e mantém o texto', () => {
    expect(semTags('🗓️ Nada em <b>setembro/2026</b>.')).toBe(
      '🗓️ Nada em setembro/2026.',
    );
  });
  it('não deixa < nem > mesmo com tags aninhadas', () => {
    expect(semTags('<<b>script>alert(1)<</b>/script>')).not.toMatch(/[<>]/);
  });
});

describe('escaparHtml', () => {
  it('escapa &, < e > (o & primeiro)', () => {
    expect(escaparHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
    expect(escaparHtml('&lt;')).toBe('&amp;lt;');
  });
  it('mantém texto comum e emoji', () => {
    expect(escaparHtml('açaí 🍔 "x"')).toBe('açaí 🍔 "x"');
  });
});

describe('comHtml', () => {
  const chamar = (method: string, payload: Record<string, unknown>) => {
    const prev = vi.fn(async (..._args: unknown[]) => ({ ok: true }) as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (comHtml as any)(prev, method, payload, undefined);
    return prev.mock.calls[0]![1];
  };
  it.each(['sendMessage', 'editMessageText', 'sendDocument'])(
    'põe parse_mode HTML em %s',
    (m) =>
      expect(chamar(m, { text: 'x' })).toEqual({
        text: 'x',
        parse_mode: 'HTML',
      }),
  );
  it('não sobrescreve parse_mode explícito', () => {
    expect(chamar('sendMessage', { parse_mode: 'MarkdownV2' })).toEqual({
      parse_mode: 'MarkdownV2',
    });
  });
  it('ignora outros métodos', () => {
    expect(chamar('answerCallbackQuery', { text: 'x' })).toEqual({ text: 'x' });
  });
});
