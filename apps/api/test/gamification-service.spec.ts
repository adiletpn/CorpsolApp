import { Timestamp } from 'firebase-admin/firestore';

import { GamificationService } from '../src/gamification/gamification.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const actor = (
  role: AuthenticatedUser['role'],
  id = 'mop-1',
  extra: Partial<AuthenticatedUser> = {},
) =>
  ({
    id,
    organizationId: ORG,
    email: `${id}@corpsol.kz`,
    role,
    departmentId: 'dep-1',
    officeId: null,
    deviceId: null,
    ...extra,
  }) as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new GamificationService(fakeFirebase(firestore)) };
}

function seedMember(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
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

function seedPoints(
  firestore: FakeFirestore,
  id: string,
  userId: string,
  points: number,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.points, id, {
    userId,
    reason: 'CALL_VOLUME',
    points,
    refType: null,
    refId: null,
    comment: null,
    createdAt: Timestamp.fromDate(new Date('2026-09-15T10:00:00Z')),
    ...fields,
  });
}

describe('кто попадает в рейтинг', () => {
  it('менеджеры и руководители соревнуются вместе', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'rop-1', { role: 'ROP' });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries).toHaveLength(2);
  });

  it('директор и кадровик в рейтинге не участвуют', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'director-1', { role: 'DIRECTOR' });
    seedMember(firestore, 'hr-1', { role: 'HR' });

    // Им не за что начислять очки — нулями они бы только засоряли таблицу.
    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries.map((item) => item.userId)).toEqual(['mop-1']);
  });

  it('уволенные выпадают из рейтинга', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'mop-fired', { status: 'TERMINATED' });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries).toHaveLength(1);
  });

  it('сотрудники чужой организации не видны', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'alien', { organizationId: 'other-org' });

    const result = await service.leaderboard(
      actor('DIRECTOR', 'dir', { departmentId: null }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(result.entries).toHaveLength(1);
  });
});
