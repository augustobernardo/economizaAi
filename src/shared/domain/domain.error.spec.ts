import { describe, expect, it } from 'vitest';
import { DomainError } from './domain.error.js';

class ErroDeTeste extends DomainError {}

describe('DomainError', () => {
  it('é uma instância de Error', () => {
    const erro = new ErroDeTeste('mensagem');

    expect(erro).toBeInstanceOf(Error);
  });

  it('usa o nome da classe concreta como name', () => {
    const erro = new ErroDeTeste('mensagem');

    expect(erro.name).toBe('ErroDeTeste');
  });

  it('preserva a mensagem recebida', () => {
    const erro = new ErroDeTeste('algo deu errado');

    expect(erro.message).toBe('algo deu errado');
  });
});
