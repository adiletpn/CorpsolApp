import { MIN_DAILY_CALL_RATE_BPS } from '@corpsol/shared';

/** Даты и числа в том виде, в каком их читает человек. */

const pad = (value: number) => String(value).padStart(2, '0');

/** Дата «ГГГГ-ММ-ДД» по часам телефона — в ней же сервер хранит табель. */
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Первое и последнее число текущего месяца. */
export function monthRange(date = new Date()): { from: string; to: string } {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: dateKey(first), to: dateKey(last) };
}

export function monthTitle(date = new Date()): string {
  const title = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return title.charAt(0).toUpperCase() + title.slice(1).replace(' г.', '');
}

/** «15 сент., вт» — для строк табеля. */
export function dayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

export function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function todayTitle(date = new Date()): string {
  const title = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Доля в процентах вниз до целого: 74,9% — это ещё не 75%. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 100) / whole);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Засчитывается ли день — то же сравнение в целых числах, что на сервере. */
export function dayPasses(outbound: number, answered: number): boolean {
  return outbound > 0 && answered * 10_000 >= outbound * MIN_DAILY_CALL_RATE_BPS;
}

/**
 * Сколько успешных звонков подряд вернут долю к порогу.
 *
 * Из (a + x) / (o + x) ≥ p следует x ≥ (p·o − a) / (1 − p). Без звонков
 * вовсе нужен хотя бы один: пустой день не засчитывается.
 */
export function answeredToPass(outbound: number, answered: number): number {
  if (dayPasses(outbound, answered)) return 0;
  const bps = MIN_DAILY_CALL_RATE_BPS;
  return Math.max(1, Math.ceil((bps * outbound - 10_000 * answered) / (10_000 - bps)));
}
