import { describe, expect, it } from 'vitest';

import {
  currentMonth,
  dateKey,
  formatDuration,
  formatMoney,
  formatPercent,
  formatPhone,
} from '../lib/period';

describe('календарная дата', () => {
  it('приводится к виду, который ждёт API', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('последний день года не уезжает в следующий', () => {
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('период по умолчанию', () => {
  it('месяц заканчивается последним числом, а не первым следующего', () => {
    const period = currentMonth();
    const [year, month, day] = period.to.split('-').map(Number);

    // Нулевой день следующего месяца — последний день текущего.
    expect(day).toBe(new Date(year, month, 0).getDate());
  });

  it('начинается с первого числа', () => {
    expect(currentMonth().from.endsWith('-01')).toBe(true);
  });
});

/// Неразрывный пробел между разрядами: от обычного он в исходнике
/// неотличим, поэтому записан кодом.
const nbsp = '\u00A0';

describe('суммы', () => {
  it('тиыны показываются тенге', () => {
    expect(formatMoney(30000000)).toBe(`300${nbsp}000 ₸`);
  });

  it('удержание показывается со знаком минус', () => {
    expect(formatMoney(-50000)).toBe('-500 ₸');
  });

  it('ноль не превращается в пустую строку', () => {
    expect(formatMoney(0)).toBe('0 ₸');
  });
});

describe('доля выполнения', () => {
  it('округляется до целых процентов', () => {
    expect(formatPercent(0.6449)).toBe('64%');
  });

  it('перевыполнение не обрезается до ста', () => {
    expect(formatPercent(1.4)).toBe('140%');
  });
});

describe('длительность разговора', () => {
  it('короткий звонок показан секундами', () => {
    // Разница между сорока секундами и двумя минутами — это разница
    // между сбросом и разговором, поэтому секунды не прячем.
    expect(formatDuration(40)).toBe('40 с');
  });

  it('ровные минуты без лишних нулей', () => {
    expect(formatDuration(180)).toBe('3 мин');
  });

  it('минуты с секундами', () => {
    expect(formatDuration(450)).toBe('7 мин 30 с');
  });

  it('несостоявшийся звонок показан прочерком', () => {
    expect(formatDuration(0)).toBe('—');
  });
});

describe('телефон', () => {
  it('слитная строка из выгрузки становится читаемой', () => {
    expect(formatPhone('77071112233')).toBe('+7 707 111 22 33');
  });

  it('уже отформатированный номер не ломается', () => {
    expect(formatPhone('+7 707 111 22 33')).toBe('+7 707 111 22 33');
  });

  it('номер неожиданной длины остаётся как есть', () => {
    // Лучше показать сырое значение, чем собрать из него бессмыслицу.
    expect(formatPhone('12345')).toBe('12345');
  });
});
