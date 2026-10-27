import type { Call } from './api';
import { dateKey, formatDate, timeLabel } from './format';

/** Период — уходит в запрос к серверу: журнал за месяц — тысячи звонков. */
export type CallPeriod = 'today' | 'yesterday' | 'week' | 'month';

export const PERIOD_LABELS: Record<CallPeriod, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: 'Неделя',
  month: 'Месяц',
};

export function periodRange(period: CallPeriod, now = new Date()): { from: string; to: string } {
  const day = (offset: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    return dateKey(date);
  };

  switch (period) {
    case 'today':
      return { from: day(0), to: day(0) };
    case 'yesterday':
      return { from: day(1), to: day(1) };
    case 'week':
      return { from: day(6), to: day(0) };
    case 'month':
      return { from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(0) };
  }
}

/** Что за звонок — так же, как значок в строке журнала. */
export type CallKind = 'out' | 'in' | 'missed';

export function callKind(call: Call): CallKind {
  if (call.status !== 'ANSWERED') return 'missed';
  return call.direction === 'INBOUND' ? 'in' : 'out';
}

export type KindFilter = 'all' | CallKind;

export const KIND_LABELS: Record<KindFilter, string> = {
  all: 'Все',
  out: 'Исходящие',
  in: 'Входящие',
  missed: 'Без ответа',
};

/** Время дня: утренний обзвон и вечерний отличаются дозвоном. */
export type DayPart = 'all' | 'morning' | 'day' | 'evening';

export const DAY_PART_LABELS: Record<DayPart, string> = {
  all: 'Весь день',
  morning: 'Утро · до 12',
  day: 'День · 12–17',
  evening: 'Вечер · с 17',
};

function inDayPart(call: Call, part: DayPart): boolean {
  if (part === 'all') return true;
  const hour = new Date(call.startedAt).getHours();
  if (part === 'morning') return hour < 12;
  if (part === 'day') return hour >= 12 && hour < 17;
  return hour >= 17;
}

/**
 * Ключевое слово ищет и в номере, и во времени: «701» — номера с этими
 * цифрами, «14:» — звонки после двух. Пробелы и «+» в номере не мешают.
 */
function matchesQuery(call: Call, query: string): boolean {
  const text = query.trim();
  if (!text) return true;

  if (text.includes(':')) return timeLabel(call.startedAt).startsWith(text);

  const digits = text.replace(/\D/g, '');
  if (digits) return call.clientPhone.replace(/\D/g, '').includes(digits);

  return call.clientPhone.toLowerCase().includes(text.toLowerCase());
}

export interface CallFilter {
  kind: KindFilter;
  dayPart: DayPart;
  query: string;
}

export function filterCalls(calls: Call[], filter: CallFilter): Call[] {
  return calls.filter(
    (call) =>
      (filter.kind === 'all' || callKind(call) === filter.kind) &&
      inDayPart(call, filter.dayPart) &&
      matchesQuery(call, filter.query),
  );
}

export interface CallDay {
  key: string;
  label: string;
  calls: Call[];
}

/** Журнал по дням, свежие сверху: «Сегодня», «Вчера», дальше датой. */
export function groupByDay(calls: Call[], now = new Date()): CallDay[] {
  const today = dateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateKey(yesterdayDate);

  const days = new Map<string, Call[]>();
  for (const call of [...calls].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const list = days.get(call.callDate) ?? [];
    list.push(call);
    days.set(call.callDate, list);
  }

  return [...days.entries()].map(([key, list]) => ({
    key,
    label: key === today ? 'Сегодня' : key === yesterday ? 'Вчера' : formatDate(key),
    calls: list,
  }));
}
