import { beforeEach, describe, expect, it, vi } from 'vitest';
import { umaEntrada } from '../../../../../test/builders/entrada.builder.js';
import { umGasto } from '../../../../../test/builders/gasto.builder.js';
import { umParcelamento } from '../../../../../test/builders/parcelamento.builder.js';
import type { Mundo } from '../../../../../test/contracts/persistencia.contract.js';
import { FakeInterpretador } from '../../../../../test/fakes/fake-interpretador.js';
import { criarMundoEmMemoria } from '../../../../../test/fakes/in-memory-mundo.js';
import { RelogioFixo } from '../../../../../test/fakes/relogio-fixo.js';
import { Cartao } from '../../domain/cartao.js';
import { DataFuturaError } from '../../domain/errors.js';
import type { Entrada } from '../../domain/entrada.js';
import type { FormaPagamento, Gasto } from '../../domain/gasto.js';
import { PendenciasEmMemoria } from '../../infrastructure/pendencias-em-memoria.js';
import {
  CartaoNaoCadastradoError,
  CorrecaoVaziaError,
  EscolhaNecessariaNaEdicaoError,
  IndiceDeCorrecaoInvalidoError,
  NenhumCartaoCadastradoError,
  PendenciaExpiradaError,
  RegistroAlteradoError,
  RegistroNaoEncontradoError,
  RegistroVazioError,
} from '../errors.js';
import type { Correcao } from '../ports/interpretador-de-mensagem.js';
import { RegistrarLancamentosUseCase } from './registrar-lancamentos.use-case.js';
import {
  CancelarEdicaoUseCase,
  ConfirmarEdicaoUseCase,
  PrepararEdicaoUseCase,
  type PropostaDeEdicao,
} from './edicao.use-cases.js';

const AGORA = new Date('2026-10-10T12:00:00Z');
const TEXTO = { tipo: 'texto', texto: 'corrige' } as const;

const correcao = (parcial: Partial<Correcao>): Correcao => ({
  alteracoes: [],
  remover: [],
  acrescentar: [],
  textoOriginal: 'corrige',
  ...parcial,
});

const cartaoDe = (nome: string) =>
  Cartao.criar({ nome, diaFechamento: 3, diaVencimento: 10, agora: AGORA });

describe('edição de registro', () => {
  let mundo: Mundo;
  let pendencias: PendenciasEmMemoria<PropostaDeEdicao>;
  let registroId: string;

  beforeEach(() => {
    mundo = criarMundoEmMemoria();
    pendencias = new PendenciasEmMemoria(new RelogioFixo(AGORA));
    registroId = crypto.randomUUID();
  });

  // `criadoEm` distinto: o repositório ordena por criadoEm e depois por id aleatório.
  let contador = 0;
  const gasto = () =>
    umGasto()
      .doRegistro(registroId)
      .em(new Date(AGORA.getTime() + contador++));
  const entrada = () => umaEntrada().doRegistro(registroId).em(AGORA);

  const preparar = (
    c: Partial<Correcao>,
    e: Parameters<PrepararEdicaoUseCase['executar']>[1] = TEXTO,
  ) => {
    const ia = new FakeInterpretador(
      { intencao: 'listarUltimos', textoOriginal: '' },
      correcao(c),
    );
    const caso = new PrepararEdicaoUseCase(
      mundo.registro,
      mundo.cartoes,
      ia,
      pendencias,
      new RelogioFixo(AGORA),
    );
    return { ia, resultado: caso.executar(registroId, e) };
  };

  const guardar = (itens: { gastos?: Gasto[]; entradas?: Entrada[] }) =>
    mundo.registro.salvar({
      gastos: itens.gastos ?? [],
      entradas: itens.entradas ?? [],
      parcelamentos: [],
    });

  describe('PrepararEdicao', () => {
    it('numera gastos e depois entradas e altera o valor', async () => {
      const g = gasto().comValor(32.5).build();
      const x = entrada().comValor(100).build();
      await guardar({ gastos: [g], entradas: [x] });

      const { ia, resultado } = preparar({
        alteracoes: [{ indice: 1, valorReais: 35 }],
      });
      const { proposta } = await resultado;

      expect(
        ia.correcoes[0]?.itens.map((i) => [i.tipo, i.indice, i.valorReais]),
      ).toEqual([
        ['gasto', 1, 32.5],
        ['entrada', 2, 100],
      ]);
      expect(proposta.antes).toEqual([g, x]);
      expect(proposta.depois[0]?.valor.centavos).toBe(3500);
      expect(proposta.depois[0]?.id).toBe(g.id);
      expect(proposta.depois[1]).toBe(x);
    });

    it('altera categoria, descrição e data do gasto e da entrada', async () => {
      await guardar({
        gastos: [gasto().comData('2026-10-01').build()],
        entradas: [entrada().build()],
      });

      const { proposta } = await preparar({
        alteracoes: [
          {
            indice: 1,
            categoria: 'transporte',
            descricao: 'Uber',
            data: '2026-10-02',
          },
          {
            indice: 2,
            categoria: 'salario',
            descricao: 'Pagamento',
            data: '2026-10-06',
          },
        ],
      }).resultado;

      const [g, x] = proposta.depois;
      expect(g).toMatchObject({
        categoria: 'transporte',
        descricao: 'Uber',
        dataGasto: '2026-10-02',
      });
      expect(x).toMatchObject({
        categoria: 'salario',
        descricao: 'Pagamento',
        dataEntrada: '2026-10-06',
      });
    });

    it('troca para "Inter crédito" e expõe o cartão na proposta', async () => {
      const inter = cartaoDe('Inter');
      await mundo.cartoes.salvar(inter);
      await guardar({ gastos: [gasto().build()] });

      const { proposta } = await preparar({
        alteracoes: [{ indice: 1, cartao: 'inter', formaPagamento: 'credito' }],
      }).resultado;

      expect(proposta.depois[0]).toMatchObject({
        pagamento: { cartaoId: inter.id, forma: 'credito' },
      });
      expect(proposta.cartoes.get(inter.id)).toBe(inter);
    });

    it('cartão não cadastrado → CartaoNaoCadastradoError', async () => {
      await guardar({ gastos: [gasto().build()] });
      const espiao = vi.spyOn(pendencias, 'guardar');
      await expect(
        preparar({
          alteracoes: [
            { indice: 1, cartao: 'Nubank', formaPagamento: 'debito' },
          ],
        }).resultado,
      ).rejects.toBeInstanceOf(CartaoNaoCadastradoError);
      expect(espiao).not.toHaveBeenCalled();
    });

    it('forma sem cartão mantém o cartão atual', async () => {
      const inter = cartaoDe('Inter');
      await mundo.cartoes.salvar(inter);
      await guardar({
        gastos: [gasto().noCartao(inter.id, 'credito').build()],
      });

      const { proposta } = await preparar({
        alteracoes: [{ indice: 1, formaPagamento: 'debito' }],
      }).resultado;

      expect(proposta.depois[0]).toMatchObject({
        pagamento: { cartaoId: inter.id, forma: 'debito' },
      });
    });

    it('cartão sem forma mantém a forma atual', async () => {
      const inter = cartaoDe('Inter');
      const itau = cartaoDe('Itau');
      await mundo.cartoes.salvar(inter);
      await mundo.cartoes.salvar(itau);
      await guardar({ gastos: [gasto().noCartao(inter.id, 'debito').build()] });

      const { proposta } = await preparar({
        alteracoes: [{ indice: 1, cartao: 'Itau' }],
      }).resultado;

      expect(proposta.depois[0]).toMatchObject({
        pagamento: { cartaoId: itau.id, forma: 'debito' },
      });
    });

    it('cartao null remove cartão e forma', async () => {
      const inter = cartaoDe('Inter');
      await mundo.cartoes.salvar(inter);
      await guardar({
        gastos: [gasto().noCartao(inter.id, 'credito').build()],
      });

      const { proposta } = await preparar({
        alteracoes: [{ indice: 1, cartao: null }],
      }).resultado;

      expect(proposta.depois[0]).toMatchObject({ pagamento: null });
    });

    it.each<[string, FormaPagamento, number, 'ok' | 'nenhum' | 'escolha']>([
      ['sem cartão cadastrado', 'credito', 0, 'nenhum'],
      ['com um cartão', 'credito', 1, 'ok'],
      ['com vários cartões', 'credito', 2, 'escolha'],
    ])(
      'forma sem cartão em item sem cartão %s',
      async (_nome, forma, qtd, esperado) => {
        for (const nome of ['Inter', 'Itau'].slice(0, qtd))
          await mundo.cartoes.salvar(cartaoDe(nome));
        await guardar({ gastos: [gasto().build()] });

        const r = preparar({
          alteracoes: [{ indice: 1, formaPagamento: forma }],
        }).resultado;

        if (esperado === 'ok')
          expect((await r).proposta.depois[0]).toMatchObject({
            pagamento: { forma },
          });
        else
          await expect(r).rejects.toBeInstanceOf(
            esperado === 'nenhum'
              ? NenhumCartaoCadastradoError
              : EscolhaNecessariaNaEdicaoError,
          );
      },
    );

    it('cartão sem forma em item sem cartão → EscolhaNecessariaNaEdicaoError', async () => {
      await mundo.cartoes.salvar(cartaoDe('Inter'));
      await guardar({ gastos: [gasto().build()] });
      await expect(
        preparar({ alteracoes: [{ indice: 1, cartao: 'Inter' }] }).resultado,
      ).rejects.toBeInstanceOf(EscolhaNecessariaNaEdicaoError);
    });

    it('remove 1 de 2', async () => {
      const a = gasto().build();
      const b = gasto().build();
      await guardar({ gastos: [a, b] });

      const { proposta } = await preparar({ remover: [2] }).resultado;

      expect(proposta.removidos).toEqual([b]);
      expect(proposta.depois).toEqual([a]);
    });

    it('remover todos → RegistroVazioError', async () => {
      await guardar({
        gastos: [gasto().build()],
        entradas: [entrada().build()],
      });
      await expect(
        preparar({ remover: [1, 2] }).resultado,
      ).rejects.toBeInstanceOf(RegistroVazioError);
    });

    it('remover todos mas acrescentar um é permitido', async () => {
      await guardar({ gastos: [gasto().build()] });
      const { proposta } = await preparar({
        remover: [1],
        acrescentar: [
          {
            valorReais: 10,
            categoria: 'transporte',
            descricao: 'Estac',
            dataGasto: '2026-10-09',
            cartao: null,
            formaPagamento: null,
          },
        ],
      }).resultado;
      expect(proposta.depois).toEqual([]);
      expect(proposta.acrescentados).toHaveLength(1);
    });

    it('acrescenta gasto herdando o registroId, origem e texto', async () => {
      await guardar({ gastos: [gasto().build()] });

      const { proposta } = await preparar(
        {
          textoOriginal: 'mais 10 de estacionamento',
          acrescentar: [
            {
              valorReais: 10,
              categoria: 'transporte',
              descricao: 'Estacionamento',
              dataGasto: '2026-10-09',
              cartao: null,
              formaPagamento: null,
            },
          ],
        },
        { tipo: 'audio', audio: Buffer.from('x'), mimeType: 'audio/ogg' },
      ).resultado;

      expect(proposta.acrescentados[0]).toMatchObject({
        registroId,
        origem: 'audio',
        textoOriginal: 'mais 10 de estacionamento',
        valor: { centavos: 1000 },
        pagamento: null,
      });
    });

    it('acrescentar com cartão sem forma → EscolhaNecessariaNaEdicaoError', async () => {
      await mundo.cartoes.salvar(cartaoDe('Inter'));
      await guardar({ gastos: [gasto().build()] });
      await expect(
        preparar({
          acrescentar: [
            {
              valorReais: 10,
              categoria: 'outros',
              descricao: 'X',
              dataGasto: '2026-10-09',
              cartao: 'Inter',
              formaPagamento: null,
            },
          ],
        }).resultado,
      ).rejects.toBeInstanceOf(EscolhaNecessariaNaEdicaoError);
    });

    it('acrescentar com cartão e forma grava o pagamento', async () => {
      const inter = cartaoDe('Inter');
      await mundo.cartoes.salvar(inter);
      await guardar({ gastos: [gasto().build()] });
      const { proposta } = await preparar({
        acrescentar: [
          {
            valorReais: 10,
            categoria: 'outros',
            descricao: 'X',
            dataGasto: '2026-10-09',
            cartao: 'Inter',
            formaPagamento: 'credito',
          },
        ],
      }).resultado;
      expect(proposta.acrescentados[0]?.pagamento).toEqual({
        cartaoId: inter.id,
        forma: 'credito',
      });
      expect(proposta.cartoes.get(inter.id)).toBe(inter);
    });

    it.each([0, 3])(
      'índice %i em alteração → IndiceDeCorrecaoInvalidoError',
      async (indice) => {
        await guardar({ gastos: [gasto().build(), gasto().build()] });
        await expect(
          preparar({ alteracoes: [{ indice, valorReais: 1 }] }).resultado,
        ).rejects.toBeInstanceOf(IndiceDeCorrecaoInvalidoError);
      },
    );

    it('índice inválido em remover → IndiceDeCorrecaoInvalidoError', async () => {
      await guardar({ gastos: [gasto().build()] });
      await expect(preparar({ remover: [2] }).resultado).rejects.toBeInstanceOf(
        IndiceDeCorrecaoInvalidoError,
      );
    });

    it('nada muda → CorrecaoVaziaError', async () => {
      await guardar({ gastos: [gasto().comValor(50).build()] });
      await expect(preparar({}).resultado).rejects.toBeInstanceOf(
        CorrecaoVaziaError,
      );
      await expect(
        preparar({ alteracoes: [{ indice: 1, valorReais: 50 }] }).resultado,
      ).rejects.toBeInstanceOf(CorrecaoVaziaError);
    });

    it('invariante de domínio vale na edição (data futura)', async () => {
      await guardar({ gastos: [gasto().build()] });
      await expect(
        preparar({ alteracoes: [{ indice: 1, data: '2026-12-01' }] }).resultado,
      ).rejects.toBeInstanceOf(DataFuturaError);
    });

    it('numera na ordem de extração mesmo com UUIDs aleatórios (criadoEm vem do registrar)', async () => {
      const registrar = new RegistrarLancamentosUseCase(
        mundo.registro,
        mundo.cartoes,
        new PendenciasEmMemoria(new RelogioFixo(AGORA)),
        new RelogioFixo(AGORA),
      );
      const extraido = (valorReais: number) => ({
        valorReais,
        categoria: 'outros',
        descricao: 'Item',
        dataGasto: '2026-10-09',
        cartao: null,
        formaPagamento: null,
      });
      for (let n = 0; n < 10; n++) {
        const r = await registrar.executar({
          interpretacao: {
            intencao: 'registrar',
            gastos: [1, 2, 3, 4].map(extraido),
            entradas: [],
            parcelamentos: [],
            textoOriginal: 'x',
          },
          origem: 'texto',
        });
        if (r.tipo !== 'registrado') throw new Error('esperava registrado');
        registroId = r.registroId;
        const { ia, resultado } = preparar({
          alteracoes: [{ indice: 1, valorReais: 9 }],
        });
        await resultado;
        expect(ia.correcoes[0]?.itens.map((i) => i.valorReais)).toEqual([
          1, 2, 3, 4,
        ]);
      }
    });

    it.each([
      [
        'alterações repetidas',
        {
          alteracoes: [
            { indice: 1, valorReais: 1 },
            { indice: 1, valorReais: 2 },
          ],
        },
      ],
      ['remover repetido', { remover: [1, 1] }],
      [
        'alterar e remover o mesmo',
        { alteracoes: [{ indice: 1, valorReais: 1 }], remover: [1] },
      ],
    ])('%s → IndiceDeCorrecaoInvalidoError', async (_nome, c) => {
      await guardar({ gastos: [gasto().build(), gasto().build()] });
      await expect(preparar(c).resultado).rejects.toBeInstanceOf(
        IndiceDeCorrecaoInvalidoError,
      );
    });

    it('remover todos é permitido se sobra parcelamento no registro', async () => {
      const cartao = cartaoDe('Inter');
      await mundo.cartoes.salvar(cartao);
      await mundo.registro.salvar({
        gastos: [gasto().build()],
        entradas: [],
        parcelamentos: [
          umParcelamento().noCartao(cartao.id).doRegistro(registroId).build(),
        ],
      });
      const { proposta } = await preparar({ remover: [1] }).resultado;
      expect(proposta.depois).toEqual([]);
    });

    it('gastos acrescentados têm criadoEm crescente', async () => {
      await guardar({ gastos: [gasto().build()] });
      const novo = (descricao: string) => ({
        valorReais: 5,
        categoria: 'outros',
        descricao,
        dataGasto: '2026-10-09',
        cartao: null,
        formaPagamento: null,
      });
      const { proposta } = await preparar({
        acrescentar: [novo('A'), novo('B')],
      }).resultado;
      const [a, b] = proposta.acrescentados;
      expect(b!.criadoEm.getTime()).toBeGreaterThan(a!.criadoEm.getTime());
    });

    it('registro inexistente → RegistroNaoEncontradoError', async () => {
      const e = await preparar({}).resultado.catch((x: unknown) => x);
      expect(e).toBeInstanceOf(RegistroNaoEncontradoError);
      expect(e).toMatchObject({ soParcelamento: false });
    });

    it('registro só com parcelamento → soParcelamento', async () => {
      const cartao = cartaoDe('Inter');
      await mundo.cartoes.salvar(cartao);
      await mundo.registro.salvar({
        gastos: [],
        entradas: [],
        parcelamentos: [
          umParcelamento().noCartao(cartao.id).doRegistro(registroId).build(),
        ],
      });
      const e = await preparar({}).resultado.catch((x: unknown) => x);
      expect(e).toMatchObject({ soParcelamento: true });
    });

    it('áudio devolve a transcrição; texto não', async () => {
      await guardar({ gastos: [gasto().build()] });
      const audio = await preparar(
        {
          textoOriginal: 'foi trinta',
          alteracoes: [{ indice: 1, valorReais: 30 }],
        },
        { tipo: 'audio', audio: Buffer.from('x'), mimeType: 'audio/ogg' },
      ).resultado;
      expect(audio.transcricao).toBe('foi trinta');
      const texto = await preparar({
        alteracoes: [{ indice: 1, valorReais: 30 }],
      }).resultado;
      expect(texto.transcricao).toBeUndefined();
    });

    it('envia à IA os nomes dos cartões e o cartão do gasto', async () => {
      const inter = cartaoDe('Inter');
      await mundo.cartoes.salvar(inter);
      await guardar({ gastos: [gasto().noCartao(inter.id, 'debito').build()] });
      const { ia, resultado } = preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      });
      await resultado;
      expect(ia.correcoes[0]?.contexto.cartoes).toEqual(['Inter']);
      expect(ia.correcoes[0]?.itens[0]).toMatchObject({
        cartao: 'Inter',
        formaPagamento: 'debito',
      });
    });
  });

  describe('ConfirmarEdicao / CancelarEdicao', () => {
    const confirmar = () =>
      new ConfirmarEdicaoUseCase(mundo.registro, pendencias);

    it('confirmar aplica pelo repositório e descarta a pendência', async () => {
      const a = gasto().comValor(32.5).build();
      const b = gasto().build();
      const x = entrada().build();
      await guardar({ gastos: [a, b], entradas: [x] });
      const { pendenteId } = await preparar({
        alteracoes: [
          { indice: 1, valorReais: 35 },
          { indice: 3, valorReais: 120 },
        ],
        remover: [2],
        acrescentar: [
          {
            valorReais: 10,
            categoria: 'outros',
            descricao: 'Novo',
            dataGasto: '2026-10-09',
            cartao: null,
            formaPagamento: null,
          },
        ],
      }).resultado;

      await confirmar().executar(pendenteId);

      const carregado = await mundo.registro.carregar(registroId);
      expect(carregado.gastos.map((g) => g.valor.centavos).sort()).toEqual([
        1000, 3500,
      ]);
      expect(carregado.gastos.map((g) => g.id)).not.toContain(b.id);
      expect(carregado.entradas[0]?.valor.centavos).toBe(12_000);
      expect(pendencias.obter(pendenteId)).toBeNull();
    });

    it('pendência inexistente ou já usada → PendenciaExpiradaError', async () => {
      await expect(confirmar().executar('nada')).rejects.toBeInstanceOf(
        PendenciaExpiradaError,
      );
      await guardar({ gastos: [gasto().build()] });
      const { pendenteId } = await preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      }).resultado;
      await confirmar().executar(pendenteId);
      await expect(confirmar().executar(pendenteId)).rejects.toBeInstanceOf(
        PendenciaExpiradaError,
      );
    });

    it('confirmar duas vezes em paralelo aplica uma só', async () => {
      await guardar({ gastos: [gasto().build()] });
      const { pendenteId } = await preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      }).resultado;
      const r = await Promise.allSettled([
        confirmar().executar(pendenteId),
        confirmar().executar(pendenteId),
      ]);
      expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    });

    it('item apagado no meio do caminho → RegistroAlteradoError', async () => {
      const g = gasto().build();
      await guardar({ gastos: [g] });
      const { pendenteId } = await preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      }).resultado;
      await mundo.registro.desfazer(registroId, new Date(0));
      await expect(confirmar().executar(pendenteId)).rejects.toBeInstanceOf(
        RegistroAlteradoError,
      );
    });

    it('cancelar descarta; depois confirmar expira', async () => {
      await guardar({ gastos: [gasto().comValor(50).build()] });
      const { pendenteId } = await preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      }).resultado;
      new CancelarEdicaoUseCase(pendencias).executar(pendenteId);
      await expect(confirmar().executar(pendenteId)).rejects.toBeInstanceOf(
        PendenciaExpiradaError,
      );
      expect(
        (await mundo.registro.carregar(registroId)).gastos[0]?.valor.centavos,
      ).toBe(5000);
    });

    it('cancelar depois de confirmar (ou expirada) → PendenciaExpiradaError', async () => {
      await guardar({ gastos: [gasto().comValor(50).build()] });
      const { pendenteId } = await preparar({
        alteracoes: [{ indice: 1, valorReais: 1 }],
      }).resultado;
      await confirmar().executar(pendenteId);
      const cancelar = new CancelarEdicaoUseCase(pendencias);
      expect(() => cancelar.executar(pendenteId)).toThrow(
        PendenciaExpiradaError,
      );
      expect(() => cancelar.executar('nao-existe')).toThrow(
        PendenciaExpiradaError,
      );
    });
  });
});
