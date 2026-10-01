import { Timestamp } from 'firebase-admin/firestore';

import { AnalyticsService } from '../src/analytics/analytics.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { PlansService } from '../src/plans/plans.service';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const actor = (
  role: AuthenticatedUser['role'],
  id = 'dir-1',
  extra: Partial<AuthenticatedUser> = {},
) =>
  ({
    id,
    organizationId: ORG,
    email: `${id}@corpsol.kz`,
    role,
    departmentId: null,
    officeId: null,
    deviceId: null,
    ...extra,
  }) as AuthenticatedUser;

/** Измерение планов проверяется своим набором тестов — здесь оно подменяется. */
const fakePlans = (options: { user?: number[]; plan?: number } = {}) =>
  ({
    progressForUser: jest.fn(async () => (options.user ?? []).map((ratio) => ({ ratio }))),
    progressForPlan: jest.fn(async () => ({ ratio: options.plan ?? 0 })),
  }) as unknown as PlansService;

function setup(plans = fakePlans()) {
  const firestore = new FakeFirestore();
  return { firestore, service: new AnalyticsService(fakeFirebase(firestore), plans) };
}

function seedUser(firestore: FakeFirestore, id: string, fields: Record<string, unknown> = {}) {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    fullName: `Сотрудник ${id}`,
    email: `${id}@corpsol.kz`,
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    baseSalaryMinor: 0,
    ...fields,
  });
}

function seedDepartment(firestore: FakeFirestore, id: string, name: string) {
  firestore.seed(COLLECTIONS.departments, id, { organizationId: ORG, name, headId: null });
}

function seedDay(
  firestore: FakeFirestore,
  userId: string,
  date: string,
  status: string,
  lateMinutes = 0,
) {
  firestore.seed(COLLECTIONS.attendance, `${userId}_${date}`, {
    userId,
    organizationId: ORG,
    departmentId: 'dep-1',
    workDate: date,
    status,
    lateMinutes,
  });
}

function seedOffer(
  firestore: FakeFirestore,
  id: string,
  userId: string,
  amountMinor: number,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.offers, id, {
    userId,
    organizationId: ORG,
    departmentId: 'dep-1',
    clientName: 'Клиент',
    clientPhone: null,
    amountMinor,
    status: 'ACCEPTED',
    sentAt: Timestamp.now(),
    sentDate: '2026-09-15',
    resolvedAt: Timestamp.now(),
    ...fields,
  });
}

describe('кто попадает в показатели работы', () => {
  it('считаются менеджеры и руководители', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'rop-1', { role: 'ROP' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(2);
  });

  it('директор и кадровик в показателях не участвуют', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'dir-1', { role: 'DIRECTOR' });
    seedUser(firestore, 'hr-1', { role: 'HR' });

    // Их посещаемость не про работу с клиентами и смазала бы картину.
    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });

  it('уволенные в показателях не участвуют', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'mop-fired', { status: 'TERMINATED' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });

  it('чужая организация не попадает в сводку', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'alien', { organizationId: 'other-org' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });
});
