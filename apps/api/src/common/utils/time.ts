/**
 * Работа с локальным временем организации. Табель строится по календарной дате
 * в часовом поясе офиса, а не по UTC — иначе ночные смены и приход в 00:30
 * попадают не в тот день.
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let existing = partsCache.get(timezone);
  if (!existing) {
    existing = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    partsCache.set(timezone, existing);
  }
  return existing;
}

export function localParts(date: Date, timezone: string): LocalParts {
  const parts = formatter(timezone).formatToParts(date);
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    // Intl отдаёт полночь как 24 при hour12: false.
    hour: pick('hour') % 24,
    minute: pick('minute'),
  };
}

/** Календарная дата смены как полночь UTC. */
export function localWorkDate(date: Date, timezone: string): Date {
  const { year, month, day } = localParts(date, timezone);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Календарная дата смены строкой «ГГГГ-ММ-ДД». Такой формат входит в ключ
 * документа посещаемости и корректно сортируется лексикографически,
 * поэтому по нему работают запросы за период.
 */
export function localWorkDateKey(date: Date, timezone: string): string {
  const { year, month, day } = localParts(date, timezone);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Минуты от начала локальных суток. */
export function localMinutesOfDay(date: Date, timezone: string): number {
  const { hour, minute } = localParts(date, timezone);
  return hour * 60 + minute;
}

/** Номер дня недели по ISO: 1 = понедельник … 7 = воскресенье. */
export function localIsoWeekday(date: Date, timezone: string): number {
  const { year, month, day } = localParts(date, timezone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** "09:30" → 570 минут. */
export function parseHhMm(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
