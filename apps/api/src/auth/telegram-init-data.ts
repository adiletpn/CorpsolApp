import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

/**
 * Сколько живёт строка запуска мини-аппа. Telegram выдаёт новую при каждом
 * открытии, так что сутки покрывают рабочий день с запасом, а перехваченная
 * строка не открывает доступ навсегда.
 */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверка подписи initData — строки, с которой Telegram запускает мини-апп.
 *
 * Номер Telegram-аккаунта нельзя брать со слов клиента: подставить чужой
 * ничего не стоит. Подпись же считается от токена бота, который есть только
 * у сервера, поэтому подделать строку без него нельзя.
 * Алгоритм — https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Возвращает пользователя Telegram или null, если подпись не сошлась,
 * строка устарела или в ней нет пользователя.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now: Date = new Date(),
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  if (now.getTime() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as {
      id?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      username?: unknown;
    } | null;
    if (!user || typeof user.id !== 'number') return null;

    return {
      id: user.id,
      firstName: typeof user.first_name === 'string' ? user.first_name : '',
      lastName: typeof user.last_name === 'string' ? user.last_name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
    };
  } catch {
    return null;
  }
}
