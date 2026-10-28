import { describe, expect, it, vi } from 'vitest';

// Клиент тянет Firebase при импорте — в тесте разбора ошибок он не нужен.
vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import { toError } from '../src/api';

describe('ошибки сервера по-человечески', () => {
  it('текст сервера показывается как есть', () => {
    const error = toError(400, { message: 'Вы вне геозоны офиса', code: 'outside_fence' });

    expect(error.message).toBe('Вы вне геозоны офиса');
    expect(error.code).toBe('outside_fence');
  });

  it('подробности отказа рядом с кодом доходят до экрана', () => {
    // Так Nest отдаёт BadRequestException({ code, message, ...details }).
    const error = toError(400, {
      code: 'outside_fence',
      message: 'Вы вне офиса',
      distanceMeters: 2400,
      fenceDays: 2,
      reprimanded: false,
    });

    expect(error.details).toEqual({ distanceMeters: 2400, fenceDays: 2, reprimanded: false });
  });

  it('объект ошибки внутри message разворачивается', () => {
    // Так Nest отдаёт исключение, брошенное с объектом.
    const error = toError(403, { message: { code: 'qr_expired', message: 'Код устарел' } });

    expect(error.code).toBe('qr_expired');
    expect(error.message).toBe('Код устарел');
  });

  it('код без текста переводится в понятную фразу', () => {
    // Раньше на этом месте было «Не удалось выполнить запрос»,
    // и сотрудник не понимал, что его аккаунт занят другим Telegram.
    expect(toError(403, { code: 'device_mismatch' }).message).toContain('другим Telegram');
    expect(toError(401, { code: 'telegram_invalid' }).message).toContain('Telegram');
  });

  it('сбой сервера не выдаётся за ошибку сотрудника', () => {
    expect(toError(502, null).message).toBe('Сервер временно недоступен. Попробуйте позже.');
  });

  it('неизвестный отказ — общая фраза, а не пустота', () => {
    expect(toError(418, {}).message).toBe('Не удалось выполнить запрос');
  });
});

describe('без интернета', () => {
  it('сотрудник видит причину по-русски, а не «Failed to fetch»', async () => {
    const { request } = await import('../src/api');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    await expect(request('/attendance/me')).rejects.toMatchObject({
      code: 'offline',
      message: 'Нет связи с интернетом. Проверьте сеть и повторите.',
    });

    vi.unstubAllGlobals();
  });
});
