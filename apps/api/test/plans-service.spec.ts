import { Timestamp } from 'firebase-admin/firestore';

import { PlansService } from '../src/plans/plans.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const actor = (role: AuthenticatedUser['role'], extra: Partial<AuthenticatedUser> = {}) =>
  ({
    id: 'u1',
    organizationId: ORG,
    email: 'test@corpsol.kz',
    role,
    departmentId: 'dep-1',
    officeId: null,
    deviceId: null,
    ...extra,
  }) as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new PlansService(fakeFirebase(firestore)) };
}

function seedPlan(
  firestore: FakeFirestore,
  id: string,
  fields: Partial<Record<string, unknown>>,
) {
  firestore.seed(COLLECTIONS.plans, id, {
    organizationId: ORG,
    scope: 'USER',
    ownerId: 'u1',
    metric: 'CALLS',
    target: 10,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    createdBy: 'director',
    createdAt: Timestamp.now(),
    ...fields,
  });
}

function seedCall(firestore: FakeFirestore, id: string, fields: Record<string, unknown>) {
  firestore.seed(COLLECTIONS.calls, id, {
    userId: 'u1',
    departmentId: 'dep-1',
    callDate: '2026-09-15',
    status: 'ANSWERED',
    talkSeconds: 120,
    ...fields,
  });
}

function seedOffer(firestore: FakeFirestore, id: string, fields: Record<string, unknown>) {
  firestore.seed(COLLECTIONS.offers, id, {
    userId: 'u1',
    departmentId: 'dep-1',
    sentDate: '2026-09-15',
    status: 'ACCEPTED',
    amountMinor: 100_000,
    ...fields,
  });
}

describe('план по звонкам', () => {
  it('считает только состоявшиеся разговоры', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'CALLS', target: 10 });

    seedCall(firestore, 'c1', { status: 'ANSWERED' });
    seedCall(firestore, 'c2', { status: 'ANSWERED' });
    seedCall(firestore, 'c3', { status: 'NO_ANSWER' });
    seedCall(firestore, 'c4', { status: 'BUSY' });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    // Недозвоны не работа: иначе план закрывался бы перебором гудков.
    expect(progress.achieved).toBe(2);
  });

  it('минуты разговора считает по чистому времени', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'TALK_MINUTES', target: 60 });

    seedCall(firestore, 'c1', { talkSeconds: 90 });
    seedCall(firestore, 'c2', { talkSeconds: 150 });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    // 240 секунд — это 4 полные минуты, остаток не округляем вверх.
    expect(progress.achieved).toBe(4);
  });

  it('не берёт звонки за пределами периода', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'CALLS', target: 10 });

    seedCall(firestore, 'inside', { callDate: '2026-09-15' });
    seedCall(firestore, 'before', { callDate: '2026-08-31' });
    seedCall(firestore, 'after', { callDate: '2026-10-01' });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    expect(progress.achieved).toBe(1);
  });

  it('не берёт чужие звонки', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'CALLS', target: 10 });

    seedCall(firestore, 'mine', { userId: 'u1' });
    seedCall(firestore, 'someone-else', { userId: 'u2' });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    expect(progress.achieved).toBe(1);
  });
});

describe('план по сделкам', () => {
  it('засчитывает только подтверждённые', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'OFFERS', target: 5 });

    seedOffer(firestore, 'o1', { status: 'ACCEPTED' });
    seedOffer(firestore, 'o2', { status: 'ACCEPTED' });
    seedOffer(firestore, 'o3', { status: 'SENT' });
    seedOffer(firestore, 'o4', { status: 'REJECTED' });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    // Иначе план закрывался бы рассылкой предложений без единой сделки.
    expect(progress.achieved).toBe(2);
  });

  it('выручку складывает только по подтверждённым', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'p1', { metric: 'REVENUE', target: 1_000_000 });

    seedOffer(firestore, 'o1', { status: 'ACCEPTED', amountMinor: 300_000 });
    seedOffer(firestore, 'o2', { status: 'SENT', amountMinor: 900_000 });

    const [progress] = await service.progressForUser(ORG, 'u1', PERIOD.start);

    expect(progress.achieved).toBe(300_000);
  });
});

describe('видимость планов', () => {
  it('менеджер видит свой план и общий план отдела, но не планы коллег', async () => {
    const { firestore, service } = setup();

    seedPlan(firestore, 'mine', { scope: 'USER', ownerId: 'u1' });
    seedPlan(firestore, 'colleague', { scope: 'USER', ownerId: 'u2' });
    seedPlan(firestore, 'department', { scope: 'DEPARTMENT', ownerId: 'dep-1' });
    seedPlan(firestore, 'other-department', { scope: 'DEPARTMENT', ownerId: 'dep-2' });

    const visible = await service.listVisible(actor('MOP'), PERIOD.start);
    const ids = visible.map((plan) => plan.id).sort();

    // Прямо по ТЗ: свои показатели и общий план отдела.
    expect(ids).toEqual(['department', 'mine']);
  });

  it('руководитель видит личные планы подчинённых и план своего отдела', async () => {
    const { firestore, service } = setup();

    seedPlan(firestore, 'subordinate', { scope: 'USER', ownerId: 'u2' });
    seedPlan(firestore, 'my-department', { scope: 'DEPARTMENT', ownerId: 'dep-1' });
    seedPlan(firestore, 'other-department', { scope: 'DEPARTMENT', ownerId: 'dep-2' });

    const visible = await service.listVisible(actor('ROP'), PERIOD.start);
    const ids = visible.map((plan) => plan.id).sort();

    expect(ids).toEqual(['my-department', 'subordinate']);
  });

  it('директор видит всё', async () => {
    const { firestore, service } = setup();

    seedPlan(firestore, 'a', { scope: 'USER', ownerId: 'u2' });
    seedPlan(firestore, 'b', { scope: 'DEPARTMENT', ownerId: 'dep-2' });

    const visible = await service.listVisible(actor('DIRECTOR', { departmentId: null }), PERIOD.start);

    expect(visible).toHaveLength(2);
  });

  it('ЧР планов не видит — к показателям продаж он отношения не имеет', async () => {
    const { firestore, service } = setup();
    seedPlan(firestore, 'a', { scope: 'DEPARTMENT', ownerId: 'dep-1' });

    const visible = await service.listVisible(actor('HR', { departmentId: null }), PERIOD.start);

    expect(visible).toHaveLength(0);
  });
});

describe('постановка плана', () => {
  it('отклоняет период, у которого конец раньше начала', async () => {
    const { service } = setup();

    await expect(
      service.create(actor('DIRECTOR'), {
        scope: 'USER',
        ownerId: 'u1',
        metric: 'CALLS',
        target: 10,
        periodStart: '2026-09-30',
        periodEnd: '2026-09-01',
      }),
    ).rejects.toThrow();
  });

  it('повторная постановка уточняет цифру, а не плодит второй план', async () => {
    const { firestore, service } = setup();

    const dto = {
      scope: 'USER' as const,
      ownerId: 'u1',
      metric: 'CALLS' as const,
      target: 10,
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
    };

    const first = await service.create(actor('DIRECTOR'), dto);
    const second = await service.create(actor('DIRECTOR'), { ...dto, target: 20 });

    // Два противоречащих плана на один период — источник неразрешимых споров.
    expect(first.id).toBe(second.id);
    expect(firestore.all(COLLECTIONS.plans)).toHaveLength(1);
    expect(second.progress.target).toBe(20);
  });
});
