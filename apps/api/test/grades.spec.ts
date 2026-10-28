import {
  DEFAULT_GRADE_TIERS,
  gradeForMonth,
  monthWeeklyBonuses,
  weekBonus,
  weeksTouchingMonth,
} from '@corpsol/shared';

const [A, B, C] = DEFAULT_GRADE_TIERS;

describe('недельный бонус по таблице учредителя', () => {
  it('ранг А, 6 регистраций — план: 6 × 5 000', () => {
    expect(weekBonus(A, 6)).toEqual({ band: 'plan', rateMinor: 5_000_00, paidCount: 6, amountMinor: 30_000_00 });
  });

  it('ранг А, 5 регистраций — ниже плана: 5 × 4 500', () => {
    expect(weekBonus(A, 5).amountMinor).toBe(22_500_00);
  });

  it('ранг А, 8 регистраций — сверх плана: все 8 по 5 500', () => {
    expect(weekBonus(A, 8)).toMatchObject({ band: 'over', amountMinor: 44_000_00 });
  });

  it('ранг Б и С — свои планы и ставки', () => {
    expect(weekBonus(B, 7)).toMatchObject({ band: 'plan', rateMinor: 8_000_00 });
    expect(weekBonus(C, 11)).toMatchObject({ band: 'over', rateMinor: 10_000_00 });
    expect(weekBonus(C, 9)).toMatchObject({ band: 'under', rateMinor: 8_500_00 });
  });

  it('неделя на стыке: полоса — по всей неделе, платится за свою часть', () => {
    // 7 за неделю у ранга А — сверх плана, но в этот месяц попали 3.
    expect(weekBonus(A, 7, 3)).toMatchObject({ band: 'over', paidCount: 3, amountMinor: 16_500_00 });
  });

  it('пустая неделя — ноль, а не отрицательная сумма', () => {
    expect(weekBonus(A, 0).amountMinor).toBe(0);
  });
});

describe('ранг по итогу месяца', () => {
  it.each([
    [45, 'C'],
    [40, 'C'],
    [39, 'B'],
    [30, 'B'],
    [29, 'A'],
    [25, 'A'],
    [10, 'A'],
  ])('%i регистраций → ранг %s', (count, code) => {
    expect(gradeForMonth(DEFAULT_GRADE_TIERS, count).code).toBe(code);
  });

  it('порядок рангов в настройках не важен', () => {
    expect(gradeForMonth([C, A, B], 31).code).toBe('B');
  });
});

describe('недели месяца', () => {
  it('октябрь 2026: с понедельника 28 сентября по воскресенье 1 ноября', () => {
    const weeks = weeksTouchingMonth(2026, 10);

    expect(weeks[0]).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(weeks[weeks.length - 1]).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weeks).toHaveLength(5);
  });

  it('месяц с понедельника не тянет лишнюю неделю', () => {
    // 1 июня 2026 — понедельник.
    expect(weeksTouchingMonth(2026, 6)[0]).toEqual({ start: '2026-06-01', end: '2026-06-07' });
  });
});

describe('недельные бонусы за месяц', () => {
  it('октябрь у ранга А: неделя на стыке с сентябрём платится за октябрьскую часть', () => {
    const dates = [
      // 28.09–04.10: 7 за неделю — сверх плана, но в октябре только 3.
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
      // 05.10–11.10: ровно план.
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
    ];

    const weeks = monthWeeklyBonuses(A, dates, 2026, 10);

    expect(weeks.map((week) => [week.week.start, week.band, week.weekCount, week.paidCount, week.amountMinor])).toEqual([
      ['2026-09-28', 'over', 7, 3, 3 * 5_500_00],
      ['2026-10-05', 'plan', 6, 6, 6 * 5_000_00],
    ]);
  });

  it('недели без регистраций в месяце не возвращаются', () => {
    expect(monthWeeklyBonuses(A, ['2026-09-15'], 2026, 10)).toEqual([]);
  });
});
