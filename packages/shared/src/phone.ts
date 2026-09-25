/**
 * Нормализация казахстанских телефонных номеров.
 *
 * Один и тот же номер в выгрузке Kcell, в карточке Bitrix и в анкете
 * сотрудника записан по-разному: «8 701 234-56-78», «+77012345678»,
 * «7012345678». Без приведения к одному виду звонки не сопоставятся
 * с людьми, и отчёты покажут нули при исправно работающем импорте.
 *
 * Канонический вид — E.164: +7 и десять цифр.
 */

const COUNTRY_CODE = '7';
const SUBSCRIBER_DIGITS = 10;

/**
 * «8» в начале — внутренний префикс выхода на межгород, а не часть номера.
 * 8-701-… и +7-701-… это один и тот же абонент.
 */
function stripTrunkPrefix(digits: string): string {
  if (digits.length === SUBSCRIBER_DIGITS + 1 && (digits[0] === '8' || digits[0] === COUNTRY_CODE)) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;

  const subscriber = stripTrunkPrefix(digits);
  if (subscriber.length !== SUBSCRIBER_DIGITS) return null;

  return `+${COUNTRY_CODE}${subscriber}`;
}

export function isValidPhone(value: string | null | undefined): boolean {
  return normalizePhone(value) !== null;
}

/** Сравнение двух номеров независимо от формата записи. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left !== null && left === right;
}

/** Показ номера человеку: +7 701 234-56-78. */
export function formatPhone(value: string | null | undefined): string | null {
  const normalized = normalizePhone(value);
  if (!normalized) return null;

  const digits = normalized.slice(2);
  return `+${COUNTRY_CODE} ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/**
 * Длительность разговора из выгрузки. Операторы пишут её то секундами,
 * то как «00:01:23», то как «1:23» — принимаем все три записи.
 * Возвращаем секунды, потому что в них хранятся звонки.
 */
export function parseDurationSeconds(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

  const trimmed = value.trim();
  if (trimmed === '') return 0;

  if (!trimmed.includes(':')) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isNaN(seconds) ? 0 : Math.max(0, seconds);
  }

  const parts = trimmed.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some(Number.isNaN)) return 0;

  // «1:23» это минуты и секунды, «01:02:03» — часы, минуты и секунды.
  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];

  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}
