import { describe, expect, it } from 'vitest';

import type { Call } from '../src/api';
import { callKind, filterCalls, groupByDay, periodRange } from '../src/calls';

/** Момент по часам телефона — так его видит сотрудник. */
const at = (date: string, hours: number, minutes = 0) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
};

const call = (id: string, fields: Partial<Call> = {}): Call => ({
  id,
  clientPhone: '+7 701 200 00 00',
  direction: 'OUTBOUND',
  status: 'ANSWERED',
  callDate: '2026-10-27',
  startedAt: at('2026-10-27', 10),
  talkSeconds: 60,
  ...fields,
});

const all = { kind: 'all' as const, dayPart: 'all' as const, query: '' };

describe('вид звонка', () => {
  it('без ответа важнее направления', () => {
    // Неотвеченный входящий — это пропущенный звонок, а не «входящий».
    expect(callKind(call('1', { direction: 'INBOUND', status: 'NO_ANSWER' }))).toBe('missed');
    expect(callKind(call('2', { direction: 'INBOUND' }))).toBe('in');
    expect(callKind(call('3'))).toBe('out');
  });
});

describe('фильтр журнала', () => {
  const calls = [
    call('morning', { startedAt: at('2026-10-27', 9, 30), clientPhone: '+7 701 555 12 34' }),
    call('day', { startedAt: at('2026-10-27', 14, 5), direction: 'INBOUND' }),
    call('evening', { startedAt: at('2026-10-27', 18, 40), status: 'BUSY' }),
  ];
  const ids = (list: Call[]) => list.map((item) => item.id);

  it('по виду звонка', () => {
    expect(ids(filterCalls(calls, { ...all, kind: 'in' }))).toEqual(['day']);
    expect(ids(filterCalls(calls, { ...all, kind: 'missed' }))).toEqual(['evening']);
  });

  it('по времени дня', () => {
    expect(ids(filterCalls(calls, { ...all, dayPart: 'morning' }))).toEqual(['morning']);
    expect(ids(filterCalls(calls, { ...all, dayPart: 'day' }))).toEqual(['day']);
    expect(ids(filterCalls(calls, { ...all, dayPart: 'evening' }))).toEqual(['evening']);
  });

  it('ключевое слово — цифры номера, пробелы не мешают', () => {
    expect(ids(filterCalls(calls, { ...all, query: '5551234' }))).toEqual(['morning']);
    expect(ids(filterCalls(calls, { ...all, query: '555 12' }))).toEqual(['morning']);
  });

  it('ключевое слово со двоеточием — время', () => {
    expect(ids(filterCalls(calls, { ...all, query: '14:' }))).toEqual(['day']);
  });

  it('фильтры складываются', () => {
    expect(filterCalls(calls, { kind: 'in', dayPart: 'morning', query: '' })).toEqual([]);
  });
});

describe('журнал по дням', () => {
  it('сегодня и вчера — словами, свежие сверху', () => {
    const now = new Date(2026, 9, 27, 20);
    const days = groupByDay(
      [
        call('old', { callDate: '2026-10-25', startedAt: at('2026-10-25', 11) }),
        call('today', { callDate: '2026-10-27', startedAt: at('2026-10-27', 11) }),
        call('yesterday', { callDate: '2026-10-26', startedAt: at('2026-10-26', 11) }),
      ],
      now,
    );

    expect(days.map((day) => day.label)).toEqual(['Сегодня', 'Вчера', '25 октября']);
  });
});

describe('период запроса', () => {
  const now = new Date(2026, 9, 27, 15);

  it.each([
    ['today', '2026-10-27', '2026-10-27'],
    ['yesterday', '2026-10-26', '2026-10-26'],
    ['week', '2026-10-21', '2026-10-27'],
    ['month', '2026-10-01', '2026-10-27'],
  ] as const)('%s → %s…%s', (period, from, to) => {
    expect(periodRange(period, now)).toEqual({ from, to });
  });
});
