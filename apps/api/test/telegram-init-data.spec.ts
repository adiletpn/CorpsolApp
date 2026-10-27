import { createHmac } from 'node:crypto';

import { INIT_DATA_MAX_AGE_SECONDS, verifyInitData } from '../src/auth/telegram-init-data';

const BOT_TOKEN = '123456:TEST-token';
const NOW = new Date('2026-10-27T09:00:00Z');
const nowSeconds = Math.floor(NOW.getTime() / 1000);

/** Подписывает строку запуска так же, как это делает Telegram. */
function signed(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Айгерим', username: 'aigerim' });

describe('строка запуска мини-аппа', () => {
  it('с верной подписью отдаёт аккаунт Telegram', () => {
    const initData = signed({ auth_date: String(nowSeconds), query_id: 'q1', user });

    expect(verifyInitData(initData, BOT_TOKEN, NOW)).toEqual({
      id: 42,
      firstName: 'Айгерим',
      lastName: undefined,
      username: 'aigerim',
    });
  });

  it('с подменённым аккаунтом отклоняется', () => {
    const initData = signed({ auth_date: String(nowSeconds), user });
    // Ровно так выглядела бы попытка войти за коллегу: номер чужой, подпись прежняя.
    const forged = initData.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":7'));

    expect(forged).not.toBe(initData);
    expect(verifyInitData(forged, BOT_TOKEN, NOW)).toBeNull();
  });

  it('подписанная чужим ботом отклоняется', () => {
    const initData = signed({ auth_date: String(nowSeconds), user }, '999:other');

    expect(verifyInitData(initData, BOT_TOKEN, NOW)).toBeNull();
  });

  it('устаревшая отклоняется', () => {
    const stale = String(nowSeconds - INIT_DATA_MAX_AGE_SECONDS - 1);

    expect(verifyInitData(signed({ auth_date: stale, user }), BOT_TOKEN, NOW)).toBeNull();
  });

  it('без подписи или без пользователя отклоняется', () => {
    expect(verifyInitData(`auth_date=${nowSeconds}&user=${encodeURIComponent(user)}`, BOT_TOKEN, NOW)).toBeNull();
    expect(verifyInitData(signed({ auth_date: String(nowSeconds) }), BOT_TOKEN, NOW)).toBeNull();
  });
});
