import { FenceAttemptsService, REPRIMAND_AFTER_DAYS } from '../src/attendance/fence-attempts.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { NotificationsService } from '../src/notifications/notifications.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const USER = { organizationId: ORG, departmentId: 'dep-1', fullName: 'Дина' };

function setup() {
  const firestore = new FakeFirestore();
  const firebase = fakeFirebase(firestore);
  for (const [id, role] of [['mop-1', 'MOP'], ['rop-1', 'ROP'], ['hr-1', 'HR'], ['dir-1', 'DIRECTOR']]) {
    firestore.seed(COLLECTIONS.users, id, { organizationId: ORG, status: 'ACTIVE', role, fullName: id });
  }
  const service = new FenceAttemptsService(firebase, new NotificationsService(firebase));
  const attempt = (workDate: string, userId = 'mop-1') =>
    service.record(userId, USER, {
      officeId: 'office-1',
      workDate,
      distanceMeters: 2400,
      radiusMeters: 100,
      lat: 43.26,
      lng: 76.95,
    });
  const reprimands = () => firestore.all(COLLECTIONS.notifications).filter((item) => item.kind === 'fence_reprimand');
  return { firestore, attempt, reprimands };
}

describe('попытки отметиться вне офиса', () => {
  it('считаются дни, а не нажатия: три попытки за утро — один день', async () => {
    const { attempt, reprimands } = setup();

    await attempt('2026-10-05');
    await attempt('2026-10-05');
    const third = await attempt('2026-10-05');

    expect(third).toEqual({ days: 1, reprimanded: false });
    expect(reprimands()).toHaveLength(0);
  });

  it('на третий день за месяц — выговор: сотруднику, РОП и HR, но не директору', async () => {
    const { attempt, reprimands } = setup();

    await attempt('2026-10-05');
    await attempt('2026-10-12');
    const result = await attempt('2026-10-20');

    expect(result).toEqual({ days: REPRIMAND_AFTER_DAYS, reprimanded: true });
    expect(reprimands().map((item) => item.userId).sort()).toEqual(['hr-1', 'mop-1', 'rop-1']);
  });

  it('выговор пишется в журнал без автора', async () => {
    const { firestore, attempt } = setup();
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-07']) await attempt(day);

    const [event] = firestore.all(COLLECTIONS.auditEvents);
    expect(event).toMatchObject({
      action: 'attendance.fence_reprimand',
      actorId: null,
      targetId: 'mop-1',
      metadata: { month: '2026-10', days: 3 },
    });
  });

  it('четвёртый день не выносит второй выговор', async () => {
    const { firestore, attempt } = setup();
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-07']) await attempt(day);

    const fourth = await attempt('2026-10-08');

    expect(fourth).toEqual({ days: 4, reprimanded: false });
    expect(firestore.all(COLLECTIONS.auditEvents)).toHaveLength(1);
  });

  it('месяц считается заново: сентябрьские попытки к октябрю не прибавляются', async () => {
    const { attempt } = setup();
    await attempt('2026-09-29');
    await attempt('2026-09-30');

    expect(await attempt('2026-10-01')).toEqual({ days: 1, reprimanded: false });
  });

  it('попытки разных сотрудников не складываются', async () => {
    const { attempt } = setup();
    await attempt('2026-10-05', 'mop-1');
    await attempt('2026-10-06', 'mop-1');

    expect(await attempt('2026-10-07', 'mop-2')).toEqual({ days: 1, reprimanded: false });
  });
});
