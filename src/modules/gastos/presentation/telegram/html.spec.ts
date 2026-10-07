import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { comHtml, escaparHtml, html, juntarHtml, type Html } from './html.js';

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

describe('tipo Html', () => {
  it('texto cru não vira Html sem passar pela tag ou pelo escape', () => {
    // @ts-expect-error string crua não é Html
    const cru: Html = 'texto cru';
    const enviar = (_t: Html): void => undefined;
    // @ts-expect-error função que pede Html não aceita string
    enviar('texto cru');
    enviar(html`ok`);
    const comoAny = JSON.parse('["<i>"]'); // JSON.parse devolve any
    // @ts-expect-error any furaria o escape (array any entraria cru)
    void html`${comoAny}`;
    expect(cru).toBe('texto cru');
  });
});

describe('html (tag)', () => {
  it('escapa interpolação string', () => {
    expect(html`<b>${'<b>x</b> & y'}</b>`).toBe(
      '<b>&lt;b&gt;x&lt;/b&gt; &amp; y</b>',
    );
  });
  it('não escapa de novo o que já é Html (aninhado como array)', () => {
    const dentro = html`<i>${'a & b'}</i>`;
    expect(html`<b>${[dentro]}</b>`).toBe('<b><i>a &amp; b</i></b>');
    // @ts-expect-error Html solto seria escapado de novo em runtime
    void html`<b>${dentro}</b>`;
  });
  it('concatena array de Html', () => {
    expect(html`${[html`<i>1</i>`, escaparHtml('<2>')]}`).toBe(
      '<i>1</i>&lt;2&gt;',
    );
  });
  it('converte número para texto', () => {
    expect(html`total: ${3}`).toBe('total: 3');
  });
});

describe('juntarHtml', () => {
  it('junta com quebra de linha por padrão, ou com o separador dado', () => {
    const partes = [html`<b>a</b>`, escaparHtml('<c>')];
    expect(juntarHtml(partes)).toBe('<b>a</b>\n&lt;c&gt;');
    expect(juntarHtml(partes, '\n\n')).toBe('<b>a</b>\n\n&lt;c&gt;');
  });
  it('escapa o separador cru', () => {
    expect(juntarHtml([html`a`, html`b`], ' & ')).toBe('a &amp; b');
  });
});

describe('origem do Html', () => {
  const src = fileURLToPath(new URL('../../../../', import.meta.url));
  const unicoComCast = [
    'modules',
    'gastos',
    'presentation',
    'telegram',
    'html.ts',
  ].join(sep);
  // Casts com "as" (inclusive via unknown) e o cast antigo com sinais de menor/maior;
  // argumento genérico (Promise de Html) não casa.
  const cast = /\bas\s+Html\b|(^|[^\w$.\s]|[=(,:?]\s*)<\s*Html\s*>/m;

  it('crie Html só por escaparHtml/tag html (SECURITY.md §3.2)', () => {
    const infratores = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && f !== unicoComCast)
      .filter((f) => cast.test(readFileSync(join(src, f), 'utf8')))
      .map((f) => relative(src, join(src, f)));
    expect(
      infratores,
      'crie Html só por escaparHtml/tag html (SECURITY.md §3.2)',
    ).toEqual([]);
  });
});
