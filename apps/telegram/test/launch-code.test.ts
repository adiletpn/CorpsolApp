import { afterEach, describe, expect, it, vi } from 'vitest';

/** Мини-апп внутри Telegram с параметром запуска и геолокацией, которая молчит. */
function telegram(startParam?: string) {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=1',
      initDataUnsafe: { start_param: startParam },
      isVersionAtLeast: () => true,
      LocationManager: {
        isInited: true,
        isLocationAvailable: true,
        isAccessGranted: true,
        isAccessRequested: true,
        init: () => undefined,
        // Колбэк не вызывается никогда — так бывает, когда окно разрешения закрыли.
        getLocation: () => undefined,
        openSettings: () => undefined,
      },
    } as never,
  };
}

afterEach(() => {
  delete window.Telegram;
  vi.useRealTimers();
  vi.resetModules();
});

describe('открытие камерой по ссылке с листка', () => {
  it('код отметки отдаётся один раз за запуск', async () => {
    telegram('q1-sJ6jXi8CaJk31Bd3zQhH-WHcGLH4OHyR_zRdb');
    const { takeLaunchCheckInCode } = await import('../src/telegram');

    expect(takeLaunchCheckInCode()).toBe('q1-sJ6jXi8CaJk31Bd3zQhH-WHcGLH4OHyR_zRdb');
    expect(takeLaunchCheckInCode()).toBeNull();
  });

  it('чужой параметр запуска отметку не запускает', async () => {
    telegram('promo2026');
    const { takeLaunchCheckInCode } = await import('../src/telegram');

    expect(takeLaunchCheckInCode()).toBeNull();
  });
});

describe('геолокация не отвечает', () => {
  it('через 20 секунд — понятная ошибка вместо вечного ожидания', async () => {
    vi.useFakeTimers();
    telegram();
    const { readPosition, LOCATION_TIMEOUT_MS, LocationError } = await import('../src/telegram');

    const reading = readPosition();
    const check = expect(reading).rejects.toBeInstanceOf(LocationError);
    await vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS);
    await check;
  });
});
