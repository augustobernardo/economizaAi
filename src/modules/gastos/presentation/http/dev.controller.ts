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
import type { Gasto } from '../../domain/gasto.js';
import { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import { ExportarGastosUseCase } from '../../application/use-cases/exportar-gastos.use-case.js';
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

function gastoParaJson(g: Gasto) {
  return {
    id: g.id,
    valorCentavos: g.valor.centavos,
    valor: g.valor.formatar(),
    categoria: g.categoria,
    descricao: g.descricao,
    dataGasto: g.dataGasto,
  };
}

function resultadoParaJson(r: ResultadoProcessamento) {
  switch (r.tipo) {
    case 'registro':
      return {
        tipo: r.tipo,
        registroId: r.registroId,
        gastos: r.gastos.map(gastoParaJson),
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
        total: r.resumo.total.formatar(),
        quantidade: r.resumo.quantidade,
        porCategoria: r.resumo.porCategoria.map((c) => ({
          categoria: c.categoria,
          total: c.total.formatar(),
          percentual: c.percentual,
        })),
      };
    case 'ultimos':
      return { tipo: r.tipo, gastos: r.gastos.map(gastoParaJson) };
  }
}

/** Endpoints de desenvolvimento; só registrados fora de produção (ver GastosModule). */
@Controller('dev')
@UseFilters(ErrosHttpFilter)
export class DevController {
  constructor(
    @Inject(ProcessarMensagemUseCase)
    private readonly processar: ProcessarMensagemUseCase,
    @Inject(ExportarGastosUseCase)
    private readonly exportar: ExportarGastosUseCase,
    @Inject(DesfazerRegistroUseCase)
    private readonly desfazer: DesfazerRegistroUseCase,
  ) {}

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
