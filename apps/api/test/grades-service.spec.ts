import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_GRADE_TIERS } from '@corpsol/shared';

import { GradesService } from '../src/payroll/grades.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const director = (organizationId = ORG): AuthenticatedUser => ({
  id: 'dir-1',
  organizationId,
  email: 'dir@corpsol.kz',
  role: 'DIRECTOR',
  departmentId: null,
  officeId: null,
  deviceId: null,
});

function setup() {
  const firestore = new FakeFirestore();
  firestore.seed(COLLECTIONS.organizations, ORG, { name: 'CorpSol', timezone: 'Asia/Almaty' });
  firestore.seed(COLLECTIONS.users, 'mop-1', { organizationId: ORG, fullName: 'Дина', role: 'MOP', gradeCode: 'A' });
  return { firestore, service: new GradesService(fakeFirebase(firestore)) };
}

describe('таблица рангов', () => {
  it('без настроек — «Новая система» учредителя', async () => {
    const { service } = setup();

    expect(await service.tiers(ORG)).toEqual(DEFAULT_GRADE_TIERS);
  });

  it('своя таблица сохраняется и читается', async () => {
    const { service } = setup();
    const custom = DEFAULT_GRADE_TIERS.map((tier) => ({ ...tier, weekPlan: tier.weekPlan + 1 }));

    await service.updateTiers(director(), custom);

    expect((await service.tiers(ORG))[0].weekPlan).toBe(7);
  });

  it('ставка сверх плана не может быть меньше ставки в план', async () => {
    const { service } = setup();
    const broken = [{ ...DEFAULT_GRADE_TIERS[0], rateOverMinor: 100 }];

    await expect(service.updateTiers(director(), broken)).rejects.toThrow(/ставка ниже плана/);
  });

  it('два ранга с одним месячным планом отклоняются', async () => {
    const { service } = setup();
    const [a, b] = DEFAULT_GRADE_TIERS;

    await expect(service.updateTiers(director(), [a, { ...b, monthPlan: a.monthPlan }])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('перевод сотрудника на ранг', () => {
  it('ранг меняется и пишется в журнал с прежним значением', async () => {
    const { firestore, service } = setup();

    await service.assign(director(), 'mop-1', 'B');

    expect(firestore.read(COLLECTIONS.users, 'mop-1')?.gradeCode).toBe('B');
    expect(firestore.all(COLLECTIONS.auditEvents)[0]).toMatchObject({
      action: 'employee.grade',
      actorId: 'dir-1',
      metadata: { from: 'A', to: 'B' },
    });
  });

  it('несуществующий ранг отклоняется', async () => {
    const { service } = setup();

    await expect(service.assign(director(), 'mop-1', 'Z')).rejects.toThrow(/Ранга «Z» нет/);
  });

  it('сотрудник чужой организации не найден', async () => {
    const { service } = setup();

    await expect(service.assign(director('org-2'), 'mop-1', 'B')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('без ранга сотрудник считается по младшему', async () => {
    const { service } = setup();

    expect((await service.tierFor(ORG, { gradeCode: null })).code).toBe('A');
  });
});

describe('прогресс ранга для менеджера', () => {
  const offers = (firestore: FakeFirestore, dates: string[], status = 'ACCEPTED', userId = 'mop-1') =>
    dates.forEach((sentDate, index) =>
      firestore.seed(COLLECTIONS.offers, `${userId}-${sentDate}-${status}-${index}`, {
        organizationId: ORG,
        userId,
        sentDate,
        status,
      }),
    );

  // Среда, 28 октября 2026, полдень по Алматы. Неделя — 26.10–01.11.
  const NOW = new Date('2026-10-28T07:00:00Z');

  it('неделя с понедельника, ставка по полосе, сколько до плана', async () => {
    const { firestore, service } = setup();
    offers(firestore, ['2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28']);
    offers(firestore, ['2026-10-25']); // воскресенье прошлой недели
    offers(firestore, ['2026-10-28'], 'SENT');

    const progress = await service.progress(ORG, 'mop-1', NOW);

    expect(progress?.week).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
      count: 4,
      band: 'under',
      rateMinor: 4_500_00,
      amountMinor: 4 * 4_500_00,
      toPlan: 2,
    });
    expect(progress?.monthCount).toBe(5);
    expect(progress?.next).toEqual({ code: 'B', name: 'Б', monthPlan: 30, left: 25 });
  });

  it('сверх плана — вся неделя по старшей ставке', async () => {
    const { firestore, service } = setup();
    offers(firestore, Array.from({ length: 8 }, () => '2026-10-27'));

    const progress = await service.progress(ORG, 'mop-1', NOW);

    expect(progress?.week).toMatchObject({ band: 'over', amountMinor: 8 * 5_500_00, toPlan: 0 });
  });

  it('неделя на стыке месяцев: регистрации прошлого месяца в неделе считаются', async () => {
    const { firestore, service } = setup();
    offers(firestore, ['2026-09-28', '2026-09-30', '2026-10-01']);

    const progress = await service.progress(ORG, 'mop-1', new Date('2026-10-02T07:00:00Z'));

    expect(progress?.week.count).toBe(3);
    expect(progress?.monthCount).toBe(1);
  });

  it('у старшего ранга следующего нет', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'mop-1', { organizationId: ORG, fullName: 'Дина', role: 'MOP', gradeCode: 'C' });

    expect((await service.progress(ORG, 'mop-1', NOW))?.next).toBeNull();
  });

  it('без ранга — null: человек на окладе и правилах', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'mop-2', { organizationId: ORG, fullName: 'Ярослав', role: 'MOP', gradeCode: null });

    expect(await service.progress(ORG, 'mop-2', NOW)).toBeNull();
  });
});
