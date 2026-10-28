import { normalizePhone } from '@corpsol/shared';

/**
 * Чем источник звонков опознаёт сотрудника.
 *
 * Выгрузка Kcell — рабочим номером телефона, Bitrix24 — номером
 * пользователя портала («12»). Прогонять всё через нормализацию
 * телефона нельзя: «12» она отбрасывает, и привязать пользователя
 * Bitrix было невозможно.
 */
export const IDENTITY_PROVIDERS = ['KCELL', 'BITRIX'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

const PHONE_KEYED: ReadonlySet<IdentityProvider> = new Set(['KCELL']);

/** Идентификатор в системе-источнике: буквы, цифры, точка, дефис, подчёркивание. */
const ID_PATTERN = /^[a-z0-9._-]{1,64}$/;

/** Ключ в едином виде или null, если он не годится для этого источника. */
export function normalizeIdentityKey(provider: IdentityProvider, raw: string): string | null {
  if (PHONE_KEYED.has(provider)) return normalizePhone(raw);

  const key = raw.trim().toLowerCase();
  return ID_PATTERN.test(key) ? key : null;
}

/** Что сказать человеку, если ключ не подошёл. */
export function identityKeyHint(provider: IdentityProvider, raw: string): string {
  return PHONE_KEYED.has(provider)
    ? `Не похоже на номер телефона: «${raw}»`
    : `Идентификатор может состоять из латинских букв, цифр, точки и дефиса: «${raw}»`;
}

/** Ключ телефонный — тогда импорт сверяет его как номер. */
export function isPhoneKeyed(provider: IdentityProvider): boolean {
  return PHONE_KEYED.has(provider);
}
