import {
  ACHIEVEMENTS,
  achievementPoints,
  calculateProgress,
  earnedAchievements,
  type AchievementContext,
  type AttendanceSummary,
} from '@corpsol/shared';

const attendance = (
  onTimeDays: number,
  lateDays = 0,
  absentDays = 0,
): AttendanceSummary => ({ onTimeDays, lateDays, absentDays, totalLateMinutes: 0 });

const context = (overrides: Partial<AchievementContext> = {}): AchievementContext => ({
  attendance: attendance(0),
  planProgress: [],
  acceptedOffers: 0,
  ...overrides,
});

describe('ачивки за пунктуальность', () => {
  it('даётся за пять смен без опозданий', () => {
    const earned = earnedAchievements(context({ attendance: attendance(5) }));

    expect(earned).toContain('PUNCTUAL_WEEK');
  });

  it('не даётся, если было хоть одно опоздание', () => {
    const earned = earnedAchievements(context({ attendance: attendance(10, 1) }));

    expect(earned).not.toContain('PUNCTUAL_WEEK');
  });

  it('не даётся за две смены — статистики ещё нет', () => {
    expect(earnedAchievements(context({ attendance: attendance(2) }))).toHaveLength(0);
  });

  it('месяц без замечаний требует отсутствия прогулов', () => {
    const withAbsence = earnedAchievements(context({ attendance: attendance(20, 0, 2) }));
    const clean = earnedAchievements(context({ attendance: attendance(20) }));

    expect(withAbsence).not.toContain('PERFECT_MONTH');
    expect(clean).toContain('PERFECT_MONTH');
  });
});

describe('ачивки за план', () => {
  it('даётся за полностью закрытый личный план', () => {
    const earned = earnedAchievements(
      context({ planProgress: [calculateProgress('CALLS', 100, 100)] }),
    );

    expect(earned).toContain('PLAN_CRUSHER');
  });

  it('не даётся, если хотя бы один план не закрыт', () => {
    const earned = earnedAchievements(
      context({
        planProgress: [
          calculateProgress('CALLS', 100, 100),
          calculateProgress('OFFERS', 10, 4),
        ],
      }),
    );

    expect(earned).not.toContain('PLAN_CRUSHER');
  });

  it('не выдаётся при отсутствии поставленных планов', () => {
    // Нулевой план считается закрытым — без этой проверки ачивку
    // получили бы все, кому план вообще не ставили.
    const earned = earnedAchievements(
      context({ planProgress: [calculateProgress('CALLS', 0, 0)] }),
    );

    expect(earned).not.toContain('PLAN_CRUSHER');
  });

  it('за перевыполнение в полтора раза даётся отдельная ачивка', () => {
    const earned = earnedAchievements(
      context({ planProgress: [calculateProgress('CALLS', 100, 150)] }),
    );

    expect(earned).toContain('OVERACHIEVER');
    expect(earned).toContain('PLAN_CRUSHER');
  });
});

describe('ачивка за сделки', () => {
  it('даётся за десять подтверждённых', () => {
    expect(earnedAchievements(context({ acceptedOffers: 10 }))).toContain('DEAL_MAKER');
  });

  it('за девять не даётся', () => {
    expect(earnedAchievements(context({ acceptedOffers: 9 }))).not.toContain('DEAL_MAKER');
  });
});

describe('очки за ачивки', () => {
  it('складывает очки набора', () => {
    const points = achievementPoints(['PUNCTUAL_WEEK', 'PLAN_CRUSHER']);

    expect(points).toBe(
      ACHIEVEMENTS.PUNCTUAL_WEEK.points + ACHIEVEMENTS.PLAN_CRUSHER.points,
    );
  });

  it('пустой набор даёт ноль', () => {
    expect(achievementPoints([])).toBe(0);
  });
});
