/**
 * Нормализация BSSID — MAC-адреса точки доступа.
 *
 * Разные источники пишут его по-разному: админ копирует из роутера
 * «AA-BB-CC-DD-EE-FF», Android отдаёт «aa:bb:cc:dd:ee:ff», iOS может
 * вернуть без разделителей. Сравнение строк «как есть» молча не совпало бы,
 * и сотрудник не смог бы отметиться, не понимая причины.
 *
 * Приводим к одному виду: строчные буквы, двоеточия как разделители.
 */
const HEX_PAIRS = 6;

export function normalizeBssid(value: string): string | null {
  const hex = value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length !== HEX_PAIRS * 2) return null;

  return (hex.match(/.{2}/g) ?? []).join(':');
}

export function isValidBssid(value: string): boolean {
  return normalizeBssid(value) !== null;
}

/**
 * Совпадает ли предъявленный BSSID с одним из разрешённых.
 * Нераспознанные значения не совпадают ни с чем — пропускать их
 * означало бы открыть проверку любому мусору.
 */
export function matchesKnownBssid(
  candidate: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!candidate) return false;

  const normalized = normalizeBssid(candidate);
  if (!normalized) return false;

  return allowed.some((item) => normalizeBssid(item) === normalized);
}
