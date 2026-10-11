import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { Cartao } from '../../domain/cartao.js';
import type { Entrada } from '../../domain/entrada.js';
import type { ComposicaoDaFatura } from '../../domain/fatura.js';
import type { Gasto } from '../../domain/gasto.js';
import type { Parcelamento } from '../../domain/parcelamento.js';
import { CadastrarCartaoUseCase } from '../../application/use-cases/cartoes.use-cases.js';
import { ConsultarFaturaUseCase } from '../../application/use-cases/faturas.use-cases.js';
import { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import { ExportarPeriodoUseCase } from '../../application/use-cases/exportar-periodo.use-case.js';
import {
  ProcessarMensagemUseCase,
  type ResultadoProcessamento,
} from '../../application/use-cases/processar-mensagem.use-case.js';
import { MAX_CARACTERES_TEXTO } from '../limites.js';
import { ErrosHttpFilter } from './erros-http.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export const textoSchema = z
  .object({ texto: z.string().trim().min(1).max(MAX_CARACTERES_TEXTO) })
  .strict();
export const registroSchema = z.object({ registroId: z.uuid() }).strict();

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const exportarQuerySchema = z
  .object({ inicio: data, fim: data, formato: z.enum(['csv', 'md']) })
  .strict();

type Cartoes = ReadonlyMap<string, Cartao>;

export const cartaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(30),
    diaFechamento: z.number().int().min(1).max(31),
    diaVencimento: z.number().int().min(1).max(31),
  })
  .strict();
export const faturaQuerySchema = z
  .object({
    cartao: z.string().trim().min(1).max(30),
    mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  })
  .strict();

/** Sem o mapa de cartões não há nome a mostrar: omite `cartao` e `formaPagamento`. */
function gastoParaJson(g: Gasto, cartoes?: Cartoes) {
  const pagamento = cartoes && {
    cartao: g.pagamento
      ? (cartoes.get(g.pagamento.cartaoId)?.nome ?? null)
      : null,
    formaPagamento: g.pagamento?.forma ?? null,
  };
  return {
    id: g.id,
    valorCentavos: g.valor.centavos,
    valor: g.valor.formatar(),
    categoria: g.categoria,
    descricao: g.descricao,
    dataGasto: g.dataGasto,
    ...pagamento,
  };
}

function entradaParaJson(e: Entrada) {
  return {
    id: e.id,
    valorCentavos: e.valor.centavos,
    categoria: e.categoria,
    descricao: e.descricao,
    dataEntrada: e.dataEntrada,
    mesFatura: e.vinculo?.mesFatura ?? null,
  };
}

function parcelamentoParaJson(p: Parcelamento) {
  return {
    id: p.id,
    descricao: p.descricao,
    quantidade: p.quantidade,
    valorParcelaCentavos: p.valorParcela.centavos,
    totalCentavos: p.total.centavos,
  };
}

function composicaoParaJson(c: ComposicaoDaFatura) {
  return {
    mes: c.mes,
    vencimento: c.vencimento,
    inicialCentavos: c.inicialCentavos,
    comprasCentavos: c.compras.centavos,
    parcelasCentavos: c.parcelasCentavos,
    reembolsosCentavos: c.reembolsosCentavos,
    totalCentavos: c.totalCentavos,
  };
}

function resultadoParaJson(r: ResultadoProcessamento) {
  switch (r.tipo) {
    case 'registro':
      return {
        tipo: r.tipo,
        registroId: r.registroId,
        gastos: r.gastos.map((g) => gastoParaJson(g, r.cartoes)),
        entradas: r.entradas.map(entradaParaJson),
        parcelamentos: r.parcelamentos.map(parcelamentoParaJson),
        avisos: r.avisos,
        textoOriginal: r.textoOriginal,
      };
    case 'escolha':
      return {
        tipo: r.tipo,
        pendenteId: r.pendenteId,
        opcoes: r.opcoes,
        textoOriginal: r.textoOriginal,
      };
    case 'exportacao':
      return {
        tipo: r.tipo,
        periodo: r.periodo.descrever(),
        quantidade: r.quantidade,
        arquivos: r.arquivos.map((a) => ({
          nomeArquivo: a.nomeArquivo,
          mimeType: a.mimeType,
          base64: a.conteudo.toString('base64'),
        })),
      };
    case 'resumo':
      return {
        tipo: r.tipo,
        periodo: r.periodo.descrever(),
        total: r.resumo.compras?.total.formatar() ?? null,
        quantidade: r.resumo.compras?.quantidade ?? 0,
        porCategoria: (r.resumo.compras?.porCategoria ?? []).map((c) => ({
          categoria: c.categoria,
          total: c.total.formatar(),
          percentual: c.percentual,
        })),
        entradasCentavos: r.resumo.entradas.totalCentavos,
        parcelasCentavos: r.resumo.parcelas.totalCentavos,
        totalGastosCentavos: r.resumo.totalGastosCentavos,
        saldoCentavos: r.resumo.saldoCentavos,
        faturas: r.resumo.faturas.map((f) => ({
          cartao: f.cartaoNome,
          ...composicaoParaJson(f.composicao),
        })),
      };
    case 'ultimos':
      return { tipo: r.tipo, gastos: r.gastos.map((g) => gastoParaJson(g)) };
    case 'fatura-informada':
      return {
        tipo: r.tipo,
        cartao: r.cartao.nome,
        ...composicaoParaJson(r.composicao),
      };
    case 'faturas':
      return {
        tipo: r.tipo,
        faturas: r.itens.map((i) => ({
          cartao: i.cartao.nome,
          ...composicaoParaJson(i.composicao),
        })),
      };
  }
}

/** Endpoints de desenvolvimento; só registrados fora de produção (ver GastosModule). */
@Controller('dev')
@UseFilters(ErrosHttpFilter)
export class DevController {
  constructor(
    @Inject(ProcessarMensagemUseCase)
    private readonly processar: ProcessarMensagemUseCase,
    @Inject(ExportarPeriodoUseCase)
    private readonly exportar: ExportarPeriodoUseCase,
    @Inject(DesfazerRegistroUseCase)
    private readonly desfazer: DesfazerRegistroUseCase,
    @Inject(CadastrarCartaoUseCase)
    private readonly cadastrarCartao: CadastrarCartaoUseCase,
    @Inject(ConsultarFaturaUseCase)
    private readonly consultarFatura: ConsultarFaturaUseCase,
  ) {}

  @Post('cartoes')
  async criarCartao(
    @Body(new ZodValidationPipe(cartaoSchema))
    corpo: z.infer<typeof cartaoSchema>,
  ) {
    const c = await this.cadastrarCartao.executar(corpo);
    return {
      id: c.id,
      nome: c.nome,
      diaFechamento: c.diaFechamento,
      diaVencimento: c.diaVencimento,
    };
  }

  @Get('faturas')
  async fatura(
    @Query(new ZodValidationPipe(faturaQuerySchema))
    query: z.infer<typeof faturaQuerySchema>,
  ) {
    const [{ cartao, composicao }] = await this.consultarFatura.executar(query);
    return { cartao: cartao.nome, ...composicaoParaJson(composicao) };
  }

  @Post('gastos/texto')
  async processarTexto(
    @Body(new ZodValidationPipe(textoSchema))
    corpo: z.infer<typeof textoSchema>,
  ) {
    return resultadoParaJson(
      await this.processar.executar({ tipo: 'texto', texto: corpo.texto }),
    );
  }

  @Delete('gastos')
  @HttpCode(200)
  async desfazerRegistro(
    @Body(new ZodValidationPipe(registroSchema))
    corpo: z.infer<typeof registroSchema>,
  ): Promise<{ removidos: number }> {
    return { removidos: await this.desfazer.executar(corpo.registroId) };
  }

  @Get('exportar')
  async exportarArquivo(
    @Query(new ZodValidationPipe(exportarQuerySchema))
    query: z.infer<typeof exportarQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const { arquivos } = await this.exportar.executar({
      inicio: query.inicio,
      fim: query.fim,
    });
    const arquivo = arquivos.find((a) => a.formato === query.formato);
    if (!arquivo) throw new Error(`Exportador ${query.formato} ausente`);
    res
      .set({
        'Content-Type': arquivo.mimeType,
        'Content-Disposition': `attachment; filename="${arquivo.nomeArquivo}"`,
      })
      .send(arquivo.conteudo);
  }
}
