import { Injectable, Logger } from '@nestjs/common';

/**
 * Ссылка на мини-апп для печатного QR.
 *
 * Обычная камера телефона открывает ссылку t.me в Telegram, а тот —
 * мини-апп с кодом в параметре запуска. Так отметиться можно, не заходя
 * в приложение. Имя бота берём у самого Telegram по токену, который
 * сервер и так хранит; TELEGRAM_MINIAPP_URL — если у мини-аппа своя
 * короткая ссылка вида https://t.me/bot/app.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);
  private base: string | null = null;

  async link(startParam: string): Promise<string | null> {
    const base = await this.resolveBase();
    return base ? `${base}?startapp=${startParam}` : null;
  }

  private async resolveBase(): Promise<string | null> {
    if (this.base) return this.base;

    const configured = process.env.TELEGRAM_MINIAPP_URL?.trim();
    if (configured) return (this.base = configured.replace(/\/+$/, ''));

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return null;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = (await response.json()) as { ok?: boolean; result?: { username?: string } };
      const username = body.ok ? body.result?.username : undefined;
      if (!username) throw new Error(`ответ ${response.status}`);
      return (this.base = `https://t.me/${username}`);
    } catch (cause) {
      // Токен в сообщение не попадает: в адресе он есть, в тексте ошибки — нет.
      this.logger.warn(`Имя бота не получено, QR будет без ссылки: ${cause instanceof Error ? cause.message : 'ошибка'}`);
      return null;
    }
  }
}
