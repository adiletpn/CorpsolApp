import { Timestamp } from 'firebase-admin/firestore';

import { AchievementsService } from '../src/gamification/achievements.service';
import { COLLECTIONS, userAchievementDocId } from '../src/firestore/collections';
import type { PlansService } from '../src/plans/plans.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const USER = 'u1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

/** Планы подменяем: их расчёт проверяется отдельными тестами. */
function fakePlans(progress: Array<{ metric: string; ratio: number; isComplete: boolean; target: number }>) {
  return {
    progressForUser: jest.fn(async () => progress),
  } as unknown as PlansService;
}

function setup(options: {
  onTimeDays?: number;
  lateDays?: number;
  acceptedOffers?: number;
  plans?: Array<{ metric: string; ratio: number; isComplete: boolean; target: number }>;
}) {
  const firestore = new FakeFirestore();

  const days = options.onTimeDays ?? 0;
  for (let index = 0; index < days; index += 1) {
    const day = String(index + 1).padStart(2, '0');
    firestore.seed(COLLECTIONS.attendance, `${USER}_2026-09-${day}`, {
      userId: USER,
      workDate: `2026-09-${day}`,
      status: 'ON_TIME',
      lateMinutes: 0,
    });
  }

  for (let index = 0; index < (options.lateDays ?? 0); index += 1) {
    const day = String(index + 20).padStart(2, '0');
    firestore.seed(COLLECTIONS.attendance, `${USER}_2026-09-${day}`, {
      userId: USER,
      workDate: `2026-09-${day}`,
      status: 'LATE',
      lateMinutes: 15,
    });
  }

  for (let index = 0; index < (options.acceptedOffers ?? 0); index += 1) {
    firestore.seed(COLLECTIONS.offers, `offer-${index}`, {
      userId: USER,
      sentDate: '2026-09-15',
      status: 'ACCEPTED',
      amountMinor: 100_000,
    });
  }

  const service = new AchievementsService(
    fakeFirebase(firestore),
    fakePlans(options.plans ?? []),
  );

  return { firestore, service };
}

describe('выдача ачивок', () => {
  it('выдаёт ачивку за пять смен без опозданий', async () => {
    const { service } = setup({ onTimeDays: 5 });

    const result = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(result.newlyEarned).toContain('PUNCTUAL_WEEK');
    expect(result.pointsAwarded).toBeGreaterThan(0);
  });

  it('записывает ачивку и начисление очков в базу', async () => {
    const { firestore, service } = setup({ onTimeDays: 5 });

    await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    const stored = firestore.read(
      COLLECTIONS.userAchievements,
      userAchievementDocId(USER, 'PUNCTUAL_WEEK'),
    );
    expect(stored?.achievementCode).toBe('PUNCTUAL_WEEK');

    // Очки должны попасть в рейтинг, иначе ачивка ни на что не влияет.
    expect(firestore.all(COLLECTIONS.points).length).toBeGreaterThan(0);
  });

  it('повторный запуск не начисляет очки второй раз', async () => {
    const { firestore, service } = setup({ onTimeDays: 5 });

    const first = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);
    const second = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(first.newlyEarned.length).toBeGreaterThan(0);
    // Пересчёт запускают регулярно — двойное начисление испортило бы рейтинг.
    expect(second.newlyEarned).toHaveLength(0);
    expect(second.pointsAwarded).toBe(0);
    expect(firestore.all(COLLECTIONS.points)).toHaveLength(first.newlyEarned.length);
  });

  it('не выдаёт ачивку при опозданиях', async () => {
    const { service } = setup({ onTimeDays: 10, lateDays: 2 });

    const result = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(result.newlyEarned).not.toContain('PUNCTUAL_WEEK');
  });

  it('выдаёт ачивку за десять подтверждённых сделок', async () => {
    const { service } = setup({ acceptedOffers: 10 });

    const result = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(result.newlyEarned).toContain('DEAL_MAKER');
  });

  it('не считает неподтверждённые сделки', async () => {
    const { firestore, service } = setup({});

    for (let index = 0; index < 12; index += 1) {
      firestore.seed(COLLECTIONS.offers, `pending-${index}`, {
        userId: USER,
        sentDate: '2026-09-15',
        status: 'SENT',
        amountMinor: 100_000,
      });
    }

    const result = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(result.newlyEarned).not.toContain('DEAL_MAKER');
  });

  it('ничего не выдаёт при пустых показателях', async () => {
    const { service } = setup({});

    const result = await service.evaluate(ORG, USER, PERIOD.start, PERIOD.end);

    expect(result.newlyEarned).toHaveLength(0);
    expect(result.pointsAwarded).toBe(0);
  });
});
