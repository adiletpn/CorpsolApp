import {
  formatPhone,
  normalizePhone,
  parseDurationSeconds,
  samePhone,
} from '@corpsol/shared';

describe('нормализация номеров', () => {
  it('приводит к одному виду все встречающиеся записи', () => {
    const expected = '+77012345678';

    expect(normalizePhone('+77012345678')).toBe(expected);
    expect(normalizePhone('87012345678')).toBe(expected);
    expect(normalizePhone('77012345678')).toBe(expected);
    expect(normalizePhone('7012345678')).toBe(expected);
    expect(normalizePhone('8 (701) 234-56-78')).toBe(expected);
    expect(normalizePhone('+7 701 234 56 78')).toBe(expected);
  });

  it('узнаёт один номер, записанный по-разному в разных системах', () => {
    // Так он лежит в выгрузке оператора и так — в карточке сотрудника.
    expect(samePhone('87012345678', '+7 701 234-56-78')).toBe(true);
  });

  it('различает разные номера', () => {
    expect(samePhone('87012345678', '87012345679')).toBe(false);
  });

  it('отвергает номера неверной длины', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('870123456789012')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('не считает совпадением два нераспознанных значения', () => {
    // Иначе любой мусор сопоставился бы с любым другим мусором.
    expect(samePhone('мусор', 'мусор')).toBe(false);
  });

  it('показывает номер в читаемом виде', () => {
    expect(formatPhone('87012345678')).toBe('+7 701 234-56-78');
  });
});

describe('длительность разговора из выгрузки', () => {
  it('понимает часы, минуты и секунды', () => {
    expect(parseDurationSeconds('01:02:03')).toBe(3723);
  });

  it('понимает запись без часов', () => {
    expect(parseDurationSeconds('1:23')).toBe(83);
  });

  it('понимает голые секунды строкой и числом', () => {
    expect(parseDurationSeconds('95')).toBe(95);
    expect(parseDurationSeconds(95)).toBe(95);
  });

  it('пустое значение считает нулём, а не ошибкой', () => {
    expect(parseDurationSeconds('')).toBe(0);
    expect(parseDurationSeconds(null)).toBe(0);
    expect(parseDurationSeconds(undefined)).toBe(0);
  });

  it('не пропускает отрицательную длительность', () => {
    expect(parseDurationSeconds(-30)).toBe(0);
  });

  it('на мусоре возвращает ноль, а не NaN', () => {
    // NaN разошёлся бы по всем суммам и сломал отчёты молча.
    expect(parseDurationSeconds('не число')).toBe(0);
    expect(Number.isNaN(parseDurationSeconds('a:b'))).toBe(false);
  });
});
