import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Сколько запросов разрешено в окне. */
  limit: number;
  /** Длина окна в миллисекундах. */
  windowMs: number;
}

/**
 * Ограничение частоты для маршрута.
 *
 * Ставится точечно, а не на всё приложение: обычные запросы идут с токеном
 * и уже ограничены тем, что учётку надо иметь. Защищать нужно то, что
 * открыто всем.
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
