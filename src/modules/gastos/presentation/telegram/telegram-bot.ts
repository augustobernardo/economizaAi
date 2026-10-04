import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { DesfazerRegistroUseCase } from '../../application/use-cases/desfazer-registro.use-case.js';
import { RegistrarGastosUseCase } from '../../application/use-cases/registrar-gastos.use-case.js';
import { TEXTO_AJUDA, TEXTO_START } from './formatador.js';
import {
  tratarDesfazer,
  tratarNaoSuportado,
  tratarTexto,
  type DepsTelegram,
} from './handlers.js';
import { criarOwnerGuard } from './owner-guard.js';
import { criarRateLimit } from './rate-limit.js';

/** Liga o grammY (long polling) aos handlers. Sem regra de negócio. */
@Injectable()
export class TelegramBot implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBot.name);
  private bot?: Bot;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RegistrarGastosUseCase)
    private readonly registrar: RegistrarGastosUseCase,
    @Inject(DesfazerRegistroUseCase)
    private readonly desfazer: DesfazerRegistroUseCase,
  ) {}

  onModuleInit(): void {
    // Testes não abrem long polling (rede, cota e 409 Conflict).
    if (process.env.NODE_ENV === 'test') return;

    const bot = new Bot(this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'));
    const deps: DepsTelegram = {
      registrar: this.registrar,
      desfazer: this.desfazer,
      logger: this.logger,
    };

    // A ordem importa: owner guard é sempre o primeiro (SECURITY.md §3.2).
    bot.use(
      criarOwnerGuard(
        Number(this.config.getOrThrow('TELEGRAM_OWNER_ID')),
        this.logger,
      ),
    );
    bot.use(criarRateLimit({ limite: 20, janelaMs: 60_000 }));
    bot.command('start', (ctx) => ctx.reply(TEXTO_START));
    bot.command('ajuda', (ctx) => ctx.reply(TEXTO_AJUDA));
    bot.on('message:text', (ctx) => tratarTexto(ctx, deps));
    bot.callbackQuery(/^d:/, (ctx) => tratarDesfazer(ctx, deps));
    bot.on('message', (ctx) => tratarNaoSuportado(ctx));
    // Só nome e mensagem: erros de rede podem carregar a URL com o token na stack.
    bot.catch((err) => {
      const erro = err.error;
      this.logger.error(
        `Erro não tratado no update ${err.ctx.update.update_id}: ${erro instanceof Error ? `${erro.name}: ${erro.message}` : typeof erro}`,
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
          `Long polling do Telegram parou: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      });
    this.bot = bot;
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot?.stop();
  }
}
