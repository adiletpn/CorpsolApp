import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RateLimitGuard } from '../src/common/rate-limit/rate-limit.guard';
import { RATE_LIMIT_KEY } from '../src/common/rate-limit/rate-limit.decorator';

/** Подменяет окружение вызова: какой маршрут и от кого пришёл запрос. */
function contextFor(handlerName: string, ip: string, headers: Record<string, unknown> = {}) {
  const handler = { name: handlerName };

  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers }),
    }),
  } as never;
}

function guardWith(options: { limit: number; windowMs: number } | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
    key === RATE_LIMIT_KEY ? options : undefined,
  );

  return new RateLimitGuard(reflector);
}

describe('ограничение частоты', () => {
  it('маршрут без ограничения пропускается всегда', () => {
    const guard = guardWith(undefined);

    for (let i = 0; i < 100; i += 1) {
      expect(guard.canActivate(contextFor('issueCode', '1.1.1.1'))).toBe(true);
    }
  });

  it('запросы в пределах нормы проходят', () => {
    const guard = guardWith({ limit: 3, windowMs: 60_000 });

    for (let i = 0; i < 3; i += 1) {
      expect(guard.canActivate(contextFor('issueCode', '1.1.1.1'))).toBe(true);
    }
  });

  it('превышение отклоняется', () => {
    const guard = guardWith({ limit: 2, windowMs: 60_000 });

    guard.canActivate(contextFor('issueCode', '1.1.1.1'));
    guard.canActivate(contextFor('issueCode', '1.1.1.1'));

    expect(() => guard.canActivate(contextFor('issueCode', '1.1.1.1'))).toThrow(
      HttpException,
    );
  });

  it('в отказе сказано, когда повторять', () => {
    const guard = guardWith({ limit: 1, windowMs: 60_000 });
    guard.canActivate(contextFor('issueCode', '1.1.1.1'));

    try {
      guard.canActivate(contextFor('issueCode', '1.1.1.1'));
      throw new Error('ожидался отказ');
    } catch (cause) {
      // Без этого клиент долбит вслепую и только усугубляет положение.
      const response = (cause as HttpException).getResponse() as { retryAfter: number };
      expect(response.retryAfter).toBeGreaterThan(0);
    }
  });

  it('разные клиенты считаются раздельно', () => {
    const guard = guardWith({ limit: 1, windowMs: 60_000 });

    guard.canActivate(contextFor('issueCode', '1.1.1.1'));

    // Иначе один перебирающий закрыл бы терминал всему офису.
    expect(guard.canActivate(contextFor('issueCode', '2.2.2.2'))).toBe(true);
  });

  it('разные маршруты считаются раздельно', () => {
    const guard = guardWith({ limit: 1, windowMs: 60_000 });

    guard.canActivate(contextFor('issueCode', '1.1.1.1'));

    expect(guard.canActivate(contextFor('checkIn', '1.1.1.1'))).toBe(true);
  });

  it('за прокси считается настоящий клиент, а не сам прокси', () => {
    const guard = guardWith({ limit: 1, windowMs: 60_000 });

    guard.canActivate(
      contextFor('issueCode', '10.0.0.1', { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }),
    );

    // Без разбора заголовка все запросы выглядят как один клиент,
    // и предел срабатывает сразу на всех.
    expect(
      guard.canActivate(
        contextFor('issueCode', '10.0.0.1', { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
      ),
    ).toBe(true);
  });

  it('окно сбрасывается по времени', () => {
    jest.useFakeTimers();
    const guard = guardWith({ limit: 1, windowMs: 1_000 });

    guard.canActivate(contextFor('issueCode', '1.1.1.1'));
    jest.advanceTimersByTime(1_500);

    expect(guard.canActivate(contextFor('issueCode', '1.1.1.1'))).toBe(true);
    jest.useRealTimers();
  });
});
