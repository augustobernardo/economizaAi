import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { RELOGIO, type Relogio } from '../../application/ports/relogio.js';
import { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import { ExportarGastosUseCase } from '../../application/use-cases/exportar-gastos.use-case.js';
import { ListarUltimosGastosUseCase } from '../../application/use-cases/listar-ultimos-gastos.use-case.js';
import { ProcessarMensagemUseCase } from '../../application/use-cases/processar-mensagem.use-case.js';
import { ResumirGastosUseCase } from '../../application/use-cases/resumir-gastos.use-case.js';
import { MAX_BYTES_AUDIO } from '../limites.js';
import { baixarArquivo, TIMEOUT_DOWNLOAD_MS } from './download.js';
import { COMANDOS, TEXTO_AJUDA, TEXTO_START } from './formatador.js';
import {
  tratarCallback,
  tratarComandoExportar,
  tratarComandoResumo,
  tratarComandoUltimos,
  tratarNaoSuportado,
  tratarTexto,
  tratarVoz,
  type DepsTelegram,
} from './handlers.js';
import { comHtml } from './html.js';
import { criarOwnerGuard } from './owner-guard.js';
import { criarRateLimit } from './rate-limit.js';

/** Liga o grammY (long polling) aos handlers. Sem regra de negócio. */
@Injectable()
export class TelegramBot implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBot.name);
  private bot?: Bot;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ProcessarMensagemUseCase)
    private readonly processar: ProcessarMensagemUseCase,
    @Inject(ExportarGastosUseCase)
    private readonly exportar: ExportarGastosUseCase,
    @Inject(ResumirGastosUseCase)
    private readonly resumir: ResumirGastosUseCase,
    @Inject(ListarUltimosGastosUseCase)
    private readonly listarUltimos: ListarUltimosGastosUseCase,
    @Inject(DesfazerRegistroUseCase)
    private readonly desfazer: DesfazerRegistroUseCase,
    @Inject(RELOGIO) private readonly relogio: Relogio,
  ) {}

  onModuleInit(): void {
    // Testes não abrem long polling (rede, cota e 409 Conflict).
    if (process.env.NODE_ENV === 'test') return;

    const token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const bot = new Bot(token);
    // Toda mensagem e legenda sai em HTML (textos do usuário são escapados no formatador).
    bot.api.config.use(comHtml);
    const deps: DepsTelegram = {
      processar: this.processar,
      exportar: this.exportar,
      resumir: this.resumir,
      listarUltimos: this.listarUltimos,
      desfazer: this.desfazer,
      logger: this.logger,
      relogio: this.relogio,
      // A URL carrega o token: existe só aqui e nunca é logada.
      baixarArquivo: (caminho) =>
        baixarArquivo(`https://api.telegram.org/file/bot${token}/${caminho}`, {
          timeoutMs: TIMEOUT_DOWNLOAD_MS,
          maxBytes: MAX_BYTES_AUDIO,
        }),
    };

    const ownerId = Number(this.config.getOrThrow('TELEGRAM_OWNER_ID'));
    // A ordem importa: owner guard é sempre o primeiro (SECURITY.md §3.2).
    bot.use(criarOwnerGuard(ownerId, this.logger));
    bot.use(criarRateLimit({ limite: 20, janelaMs: 60_000 }));
    bot.command('start', (ctx) => ctx.reply(TEXTO_START));
    bot.command('ajuda', (ctx) => ctx.reply(TEXTO_AJUDA));
    bot.command('exportar', (ctx) => tratarComandoExportar(ctx, deps));
    bot.command('resumo', (ctx) => tratarComandoResumo(ctx, deps));
    bot.command('ultimos', (ctx) => tratarComandoUltimos(ctx, deps));
    bot.on('message:text', (ctx) => tratarTexto(ctx, deps));
    bot.on('message:voice', (ctx) => tratarVoz(ctx, deps));
    bot.on('callback_query:data', (ctx) => tratarCallback(ctx, deps));
    bot.on('message', (ctx) => tratarNaoSuportado(ctx));
    // Só o nome: message e stack podem conter texto do usuário ou a URL com o token.
    bot.catch((err) => {
      const erro = err.error;
      this.logger.error(
        `Erro não tratado no update ${err.ctx.update.update_id}: ${erro instanceof Error ? erro.name : typeof erro}`,
      );
    });

    // Menu de comandos só no chat do dono (sem escopo, estranhos o veriam); falha não derruba o boot.
    bot.api
      .setMyCommands(COMANDOS, { scope: { type: 'chat', chat_id: ownerId } })
      .catch((erro: unknown) => {
        this.logger.error(
          `setMyCommands falhou: ${erro instanceof Error ? erro.name : typeof erro}`,
        );
      });

    // Sem await: long polling não pode travar o boot. Falha (409, token inválido) não derruba o app.
    bot
      .start({
        onStart: (info) =>
          this.logger.log(`Bot @${info.username} em long polling`),
      })
      .catch((erro: unknown) => {
        this.logger.error(
          `Long polling do Telegram parou: ${erro instanceof Error ? erro.name : typeof erro}`,
        );
      });
    this.bot = bot;
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot?.stop();
  }
}
