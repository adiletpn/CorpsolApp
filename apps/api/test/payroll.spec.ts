import {
  applyBps,
  calculatePayroll,
  calculateProgress,
  formatMinor,
  type AttendanceSummary,
  type BonusRule,
} from '@corpsol/shared';

/** Оклад 250 000 ₸ в тиынах. */
const BASE = 25_000_000;

const perfectAttendance: AttendanceSummary = {
  onTimeDays: 22,
  lateDays: 0,
  absentDays: 0,
  totalLateMinutes: 0,
};

describe('доля от суммы в базисных пунктах', () => {
  it('считает проценты от оклада', () => {
    expect(applyBps(BASE, 1_000)).toBe(2_500_000); // 10%
    expect(applyBps(BASE, 500)).toBe(1_250_000); // 5%
  });

  it('округляет всегда в одну сторону и возвращает целое', () => {
    // 3 333 тиына * 5% = 166.65 — дробных тиынов не бывает.
    const result = applyBps(3_333, 500);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(167);
  });

  it('не накапливает ошибку дробных чисел', () => {
    // Сто начислений по 10% должны дать ровно десятикратный оклад.
    const once = applyBps(BASE, 1_000);
    const hundred = Array.from({ length: 100 }, () => once).reduce((a, b) => a + b, 0);
    expect(hundred).toBe(once * 100);
  });
});

describe('расчёт за период', () => {
  it('платит оклад, когда правил нет', () => {
    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: perfectAttendance,
      planProgress: [],
      rules: [],
    });

    expect(result.totalMinor).toBe(BASE);
    expect(result.bonusMinor).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('начисляет премию за выполненный план', () => {
    const rule: BonusRule = {
      id: 'plan-calls',
      kind: 'PLAN_COMPLETION',
      metric: 'CALLS',
      threshold: 100,
      amountMinor: 0,
      percentBps: 2_000, // 20% оклада
    };

    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: perfectAttendance,
      planProgress: [calculateProgress('CALLS', 200, 200)],
      rules: [rule],
    });

    expect(result.bonusMinor).toBe(5_000_000);
    expect(result.totalMinor).toBe(BASE + 5_000_000);
  });

  it('не принимает 99,5% за выполненный план', () => {
    const rule: BonusRule = {
      id: 'plan-calls',
      kind: 'PLAN_COMPLETION',
      metric: 'CALLS',
      threshold: 100,
      amountMinor: 0,
      percentBps: 2_000,
    };

    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: perfectAttendance,
      // 199 из 200 — порог не взят.
      planProgress: [calculateProgress('CALLS', 200, 199)],
      rules: [rule],
    });

    expect(result.bonusMinor).toBe(0);
  });

  it('платит за перевыполнение по факту, а не по плану', () => {
    const rule: BonusRule = {
      id: 'per-offer',
      kind: 'PER_UNIT',
      metric: 'OFFERS',
      threshold: 0,
      amountMinor: 100_000, // 1000 ₸ за сделку
      percentBps: 0,
    };

    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: perfectAttendance,
      // План 10, сделано 13 — платим за 13.
      planProgress: [calculateProgress('OFFERS', 10, 13)],
      rules: [rule],
    });

    expect(result.bonusMinor).toBe(1_300_000);
  });
});

describe('удержания', () => {
  const latePenalty: BonusRule = {
    id: 'late',
    kind: 'LATE_PENALTY',
    // Одно опоздание за месяц прощается.
    threshold: 1,
    amountMinor: 200_000, // 2000 ₸ за каждое следующее
    percentBps: 0,
  };

  it('прощает опоздания в пределах порога', () => {
    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: { ...perfectAttendance, lateDays: 1 },
      planProgress: [],
      rules: [latePenalty],
    });

    expect(result.penaltyMinor).toBe(0);
  });

  it('удерживает за каждое опоздание сверх порога', () => {
    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: { ...perfectAttendance, lateDays: 4 },
      planProgress: [],
      rules: [latePenalty],
    });

    // Три наказуемых опоздания по 2000 ₸.
    expect(result.penaltyMinor).toBe(600_000);
    expect(result.totalMinor).toBe(BASE - 600_000);
  });

  it('не удерживает больше половины оклада', () => {
    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      // Абсурдное число опозданий: начислилось бы больше оклада.
      attendance: { ...perfectAttendance, lateDays: 100 },
      planProgress: [],
      rules: [latePenalty],
    });

    // Начислено больше предела — значит, предел действительно сработал.
    expect(result.rawPenaltyMinor).toBeGreaterThan(BASE / 2);
    expect(result.penaltyMinor).toBe(BASE / 2);
    expect(result.totalMinor).toBe(BASE / 2);
  });

  it('никогда не уходит в минус', () => {
    const result = calculatePayroll({
      baseSalaryMinor: 0,
      attendance: { ...perfectAttendance, lateDays: 50 },
      planProgress: [],
      rules: [latePenalty],
    });

    // Сотрудник не может остаться должен компании по итогам месяца.
    expect(result.totalMinor).toBe(0);
  });
});

describe('расшифровка расчёта', () => {
  it('показывает, из чего сложилась сумма', () => {
    const result = calculatePayroll({
      baseSalaryMinor: BASE,
      attendance: { ...perfectAttendance, lateDays: 3 },
      planProgress: [calculateProgress('CALLS', 100, 100)],
      rules: [
        { id: 'plan', kind: 'PLAN_COMPLETION', metric: 'CALLS', threshold: 100, amountMinor: 0, percentBps: 1_000 },
        { id: 'late', kind: 'LATE_PENALTY', threshold: 1, amountMinor: 100_000, percentBps: 0 },
      ],
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].amountMinor).toBeGreaterThan(0);
    // Удержания видны отрицательными — сотрудник понимает, за что вычли.
    expect(result.lines[1].amountMinor).toBeLessThan(0);
  });
});

describe('показ сумм', () => {
  it('переводит тиыны в тенге', () => {
    // Русская локаль разделяет разряды неразрывным пробелом, а не обычным:
    // прямое сравнение строк на этом молча не сходится.
    const formatted = formatMinor(25_000_000).replace(/\u00a0/g, ' ');
    expect(formatted).toBe('250 000 ₸');
  });
});
