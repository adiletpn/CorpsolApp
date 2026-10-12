import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';

/**
 * Проверка живости для облака. Балансировщик дёргает её без токена,
 * поэтому маршрут открытый — и по той же причине он не должен сообщать
 * ничего, кроме факта «процесс отвечает».
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
