import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Ограничение частоты запросов.
 *
 * Счётчик держится в памяти процесса. В нескольких экземплярах предел
 * умножается на их число — для защиты от перебора этого достаточно, а
 * общий счётчик пришлось бы держать в базе и платить обращением за
 * каждый запрос, в том числе за честный.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getHandler().name}:${this.clientOf(request)}`;
    const now = Date.now();

    const window = this.windows.get(key);

    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + options.windowMs });
      this.sweep(now);
      return true;
    }

    window.count += 1;

    if (window.count > options.limit) {
      // Секунды до сброса — чтобы клиент знал, когда повторять,
      // а не долбил вслепую, усугубляя положение.
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      throw new HttpException(
        {
          code: 'too_many_requests',
          message: `Слишком много запросов. Повторите через ${retryAfter} с.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Кто спрашивает.
   *
   * За обратным прокси настоящий адрес приходит заголовком; без этого
   * все запросы выглядели бы как один клиент, и предел срабатывал бы
   * на всех сразу.
   */
  private clientOf(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];

    return (first ?? request.ip ?? 'unknown').trim();
  }

  /** Выброс просроченных окон: иначе карта растёт с каждым новым адресом. */
  private sweep(now: number): void {
    if (this.windows.size < 1000) return;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
