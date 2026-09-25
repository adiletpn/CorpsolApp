import {
  calculateAttendanceRates,
  detectRisks,
  mergeAttendance,
  ratePercent,
  type AttendanceSummary,
} from '@corpsol/shared';

const summary = (
  onTimeDays: number,
  lateDays: number,
  absentDays: number,
  totalLateMinutes = 0,
): AttendanceSummary => ({ onTimeDays, lateDays, absentDays, totalLateMinutes });

describe('посещаемость и пунктуальность — разные метрики', () => {
  it('идеальная пунктуальность не скрывает прогулы', () => {
    // Пришёл 10 раз, всегда вовремя, но пропустил 10 смен.
    const rates = calculateAttendanceRates(summary(10, 0, 10));

    expect(ratePercent(rates.punctualityRate)).toBe(100);
    // Одна общая цифра показала бы «100%» и спрятала половину прогулов.
    expect(ratePercent(rates.attendanceRate)).toBe(50);
  });

  it('полная посещаемость не скрывает опоздания', () => {
    const rates = calculateAttendanceRates(summary(2, 18, 0));

    expect(ratePercent(rates.attendanceRate)).toBe(100);
    expect(ratePercent(rates.punctualityRate)).toBe(10);
  });

  it('считает среднее опоздание среди опоздавших дней', () => {
    const rates = calculateAttendanceRates(summary(10, 4, 0, 100));

    // 100 минут на 4 опоздания, а не на 14 отработанных дней.
    expect(rates.averageLateMinutes).toBe(25);
  });

  it('не делит на ноль при пустом периоде', () => {
    const rates = calculateAttendanceRates(summary(0, 0, 0));

    expect(rates.attendanceRate).toBe(1);
    expect(rates.punctualityRate).toBe(1);
    expect(rates.averageLateMinutes).toBe(0);
  });
});

describe('сводка по отделу', () => {
  it('складывает счётчики сотрудников', () => {
    const merged = mergeAttendance([summary(10, 2, 1, 30), summary(8, 4, 0, 60)]);

    expect(merged).toEqual({
      onTimeDays: 18,
      lateDays: 6,
      absentDays: 1,
      totalLateMinutes: 90,
    });
  });

  it('пустой отдел не ломает расчёт', () => {
    expect(mergeAttendance([])).toEqual({
      onTimeDays: 0,
      lateDays: 0,
      absentDays: 0,
      totalLateMinutes: 0,
    });
  });
});

describe('признаки, требующие вмешательства', () => {
  it('отмечает частые опоздания', () => {
    const rates = calculateAttendanceRates(summary(3, 7, 0));
    const flags = detectRisks(rates, null);

    expect(flags.map((flag) => flag.code)).toContain('FREQUENT_LATE');
  });

  it('повышает серьёзность при совсем плохих показателях', () => {
    const rates = calculateAttendanceRates(summary(1, 9, 0));
    const [flag] = detectRisks(rates, null);

    expect(flag.severity).toBe('critical');
  });

  it('не делает выводов по паре дней', () => {
    // Два дня, одно опоздание — статистики ещё нет.
    const rates = calculateAttendanceRates(summary(1, 1, 0));

    expect(detectRisks(rates, null)).toHaveLength(0);
  });

  it('отмечает отставание по плану', () => {
    const rates = calculateAttendanceRates(summary(20, 0, 0));
    const flags = detectRisks(rates, 0.45);

    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe('PLAN_BEHIND');
    expect(flags[0].severity).toBe('critical');
  });

  it('молчит, когда всё в порядке', () => {
    const rates = calculateAttendanceRates(summary(20, 1, 0));

    expect(detectRisks(rates, 0.95)).toHaveLength(0);
  });
});
