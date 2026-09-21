import { localIsoWeekday, localMinutesOfDay, localWorkDate, parseHhMm } from '../src/common/utils/time';

const ALMATY = 'Asia/Almaty';

describe('локальное время организации', () => {
  it('относит приход к правильной календарной дате смены', () => {
    // 20:00 UTC 21 сентября — это уже 22 сентября в Алматы (UTC+5).
    const date = localWorkDate(new Date('2026-09-21T20:00:00Z'), ALMATY);
    expect(date.toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('считает минуты от начала локальных суток', () => {
    // 04:30 UTC = 09:30 в Алматы.
    expect(localMinutesOfDay(new Date('2026-09-21T04:30:00Z'), ALMATY)).toBe(9 * 60 + 30);
  });

  it('определяет день недели по ISO', () => {
    // 21 сентября 2026 — понедельник.
    expect(localIsoWeekday(new Date('2026-09-21T04:00:00Z'), ALMATY)).toBe(1);
  });

  it('разбирает время графика', () => {
    expect(parseHhMm('09:30')).toBe(570);
    expect(parseHhMm('00:00')).toBe(0);
  });
});
