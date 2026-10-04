import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Post,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';
import { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import { RegistrarGastosUseCase } from '../../application/use-cases/registrar-gastos.use-case.js';
import { ErrosHttpFilter } from './erros-http.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const MAX_CARACTERES_TEXTO = 500;
const MAX_IDS = 50;

export const TextoSchema = z
  .object({ texto: z.string().trim().min(1).max(MAX_CARACTERES_TEXTO) })
  .strict();
export const IdsSchema = z
  .object({ ids: z.array(z.uuid()).max(MAX_IDS) })
  .strict();

/** Endpoint de desenvolvimento; só registrado fora de produção (ver GastosModule). */
@Controller('dev/gastos')
@UseFilters(ErrosHttpFilter)
export class DevController {
  constructor(
    @Inject(RegistrarGastosUseCase)
    private readonly registrar: RegistrarGastosUseCase,
    @Inject(DesfazerRegistroUseCase)
    private readonly desfazer: DesfazerRegistroUseCase,
  ) {}

  @Post('texto')
  async registrarTexto(
    @Body(new ZodValidationPipe(TextoSchema))
    corpo: z.infer<typeof TextoSchema>,
  ) {
    const { gastos, textoOriginal } = await this.registrar.executar({
      tipo: 'texto',
      texto: corpo.texto,
    });
    return {
      gastos: gastos.map((g) => ({
        id: g.id,
        valorCentavos: g.valor.centavos,
        valor: g.valor.formatar(),
        categoria: g.categoria,
        descricao: g.descricao,
        dataGasto: g.dataGasto,
      })),
      textoOriginal,
    };
  }

  @Delete()
  @HttpCode(204)
  async desfazerRegistro(
    @Body(new ZodValidationPipe(IdsSchema)) corpo: z.infer<typeof IdsSchema>,
  ): Promise<void> {
    await this.desfazer.executar(corpo.ids);
  }
}
