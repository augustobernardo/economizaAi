import { describe, expect, it } from 'vitest';
import type { Relogio } from '../application/ports/relogio.js';
import { PendenciasEmMemoria } from './pendencias-em-memoria.js';

class RelogioMutavel implements Relogio {
  constructor(public instante: Date) {}

  agora(): Date {
    return this.instante;
  }

  avancarMs(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

const MINUTO = 60_000;
const inicio = () => new RelogioMutavel(new Date('2026-10-10T12:00:00Z'));

describe('PendenciasEmMemoria', () => {
  it('guarda e obtém o valor pelo id devolvido', () => {
    const pendencias = new PendenciasEmMemoria<{ n: number }>(inicio());
    const id = pendencias.guardar({ n: 1 });
    expect(typeof id).toBe('string');
    expect(pendencias.obter(id)).toEqual({ n: 1 });
  });

  it('devolve ids distintos para valores distintos', () => {
    const pendencias = new PendenciasEmMemoria<string>(inicio());
    expect(pendencias.guardar('a')).not.toBe(pendencias.guardar('b'));
  });

  it('devolve null para id desconhecido', () => {
    const pendencias = new PendenciasEmMemoria<string>(inicio());
    expect(pendencias.obter('nao-existe')).toBeNull();
  });

  it('descarta o valor', () => {
    const pendencias = new PendenciasEmMemoria<string>(inicio());
    const id = pendencias.guardar('x');
    pendencias.descartar(id);
    expect(pendencias.obter(id)).toBeNull();
  });

  it('descartar id desconhecido não lança', () => {
    const pendencias = new PendenciasEmMemoria<string>(inicio());
    expect(() => pendencias.descartar('nao-existe')).not.toThrow();
  });

  it('valor vale até 15 min e expira exatamente aos 15 min', () => {
    const relogio = inicio();
    const pendencias = new PendenciasEmMemoria<string>(relogio);
    const id = pendencias.guardar('x');

    relogio.avancarMs(15 * MINUTO - 1);
    expect(pendencias.obter(id)).toBe('x');

    relogio.avancarMs(1);
    expect(pendencias.obter(id)).toBeNull();
  });

  it('obter de id expirado remove a entrada', () => {
    const relogio = inicio();
    const pendencias = new PendenciasEmMemoria<string>(relogio, 1 * MINUTO);
    const id = pendencias.guardar('x');
    relogio.avancarMs(MINUTO);
    expect(pendencias.obter(id)).toBeNull();
  });

  it('guardar após vencimento mantém as novas pendências válidas', () => {
    const relogio = inicio();
    const pendencias = new PendenciasEmMemoria<number>(relogio, MINUTO, 50);
    const velhos = Array.from({ length: 50 }, (_, i) => pendencias.guardar(i));
    relogio.avancarMs(MINUTO);
    const novos = Array.from({ length: 50 }, (_, i) =>
      pendencias.guardar(100 + i),
    );
    for (const id of velhos) expect(pendencias.obter(id)).toBeNull();
    novos.forEach((id, i) => expect(pendencias.obter(id)).toBe(100 + i));
  });

  it('acima do limite remove a mais antiga por inserção', () => {
    const pendencias = new PendenciasEmMemoria<number>(
      inicio(),
      15 * MINUTO,
      50,
    );
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) ids.push(pendencias.guardar(i));

    expect(pendencias.obter(ids[0]!)).toBeNull();
    expect(pendencias.obter(ids[1]!)).toBe(1);
    expect(pendencias.obter(ids[50]!)).toBe(50);
  });

  it('mantém até 50 valores vivos', () => {
    const pendencias = new PendenciasEmMemoria<number>(inicio());
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) ids.push(pendencias.guardar(i));
    for (let i = 0; i < 50; i++) expect(pendencias.obter(ids[i]!)).toBe(i);
  });
});
