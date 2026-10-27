import { Timestamp } from 'firebase-admin/firestore';

import { CallRateService } from '../src/attendance/call-rate.service';
import { JobLockService } from '../src/common/jobs/job-lock.service';
import { COLLECTIONS, attendanceDocId } from '../src/firestore/collections';
import { NotificationsService } from '../src/notifications/notifications.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const WORK_DATE = '2026-09-15';

function setup() {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.organizations, ORG, {
    name: 'CorpSol',
    timezone: 'Asia/Almaty',
  });

  const firebase = fakeFirebase(firestore);
  const service = new CallRateService(
    firebase,
    new JobLockService(firebase),
    new NotificationsService(firebase),
  );
  return { firestore, service };
}

function seedEmployee(firestore: FakeFirestore, id: string, role = 'MOP') {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    fullName: `Сотрудник ${id}`,
    role,
    status: 'ACTIVE',
    departmentId: 'dep-1',
  });
}

function seedDay(
  firestore: FakeFirestore,
  userId: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.attendance, attendanceDocId(userId, WORK_DATE), {
    userId,
    organizationId: ORG,
    departmentId: 'dep-1',
    workDate: WORK_DATE,
    status: 'ON_TIME',
    lateMinutes: 0,
    method: 'QR',
    adjustedBy: null,
    adjustNote: null,
    createdAt: Timestamp.now(),
    ...fields,
  });
}

let callSeq = 0;

/** Звонки за день: сколько исходящих и сколько из них с разговором. */
function seedCalls(
  firestore: FakeFirestore,
  userId: string,
  outbound: number,
  answered: number,
  direction: 'OUTBOUND' | 'INBOUND' = 'OUTBOUND',
) {
  for (let index = 0; index < outbound; index += 1) {
    callSeq += 1;
    firestore.seed(COLLECTIONS.calls, `call-${callSeq}`, {
      userId,
      organizationId: ORG,
      direction,
      status: index < answered ? 'ANSWERED' : 'NO_ANSWER',
      callDate: WORK_DATE,
      talkSeconds: index < answered ? 60 : 0,
    });
  }
}

const dayOf = (firestore: FakeFirestore, userId: string) =>
  firestore.read(COLLECTIONS.attendance, attendanceDocId(userId, WORK_DATE));

describe('доля дозвонов решает, засчитан ли день', () => {
  it('меньше 75% — день не засчитан', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');
    seedCalls(firestore, 'mop-1', 20, 14);

    const result = await service.checkForOrganization(ORG, WORK_DATE);

    expect(result.notCounted).toBe(1);
    expect(dayOf(firestore, 'mop-1')?.status).toBe('NOT_COUNTED');
    expect(dayOf(firestore, 'mop-1')?.callCheck).toMatchObject({
      outbound: 20,
      answered: 14,
      rateBps: 7000,
      statusBefore: 'ON_TIME',
    });
  });

  it('ровно 75% — день засчитан', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', { status: 'LATE', lateMinutes: 12 });
    seedCalls(firestore, 'mop-1', 20, 15);

    await service.checkForOrganization(ORG, WORK_DATE);

    // Опоздание остаётся опозданием: проверка не повышает статус.
    expect(dayOf(firestore, 'mop-1')?.status).toBe('LATE');
  });

  it('без исходящих звонков день не засчитан', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');

    await service.checkForOrganization(ORG, WORK_DATE);

    expect(dayOf(firestore, 'mop-1')?.status).toBe('NOT_COUNTED');
  });

  it('входящие в долю не идут', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');
    seedCalls(firestore, 'mop-1', 10, 5);
    // Отвеченные входящие вытянули бы долю до 75%, но звонил не менеджер.
    seedCalls(firestore, 'mop-1', 10, 10, 'INBOUND');

    await service.checkForOrganization(ORG, WORK_DATE);

    expect(dayOf(firestore, 'mop-1')?.callCheck).toMatchObject({ outbound: 10, answered: 5 });
    expect(dayOf(firestore, 'mop-1')?.status).toBe('NOT_COUNTED');
  });

  it('сотрудник узнаёт, почему день не засчитан', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');
    seedCalls(firestore, 'mop-1', 20, 12);

    await service.checkForOrganization(ORG, WORK_DATE);

    const [notification] = firestore.all(COLLECTIONS.notifications);
    expect(notification).toMatchObject({ userId: 'mop-1', kind: 'day_not_counted' });
    expect(notification.body).toContain('60% (12 из 20)');
  });
});

describe('что проверка не трогает', () => {
  it('день РОПа', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'rop-1', 'ROP');
    seedDay(firestore, 'rop-1');

    const result = await service.checkForOrganization(ORG, WORK_DATE);

    expect(result.checked).toBe(0);
    expect(dayOf(firestore, 'rop-1')?.status).toBe('ON_TIME');
  });

  it('правку руководителя', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', { method: 'MANUAL_ADJUSTMENT', adjustedBy: 'rop-1' });

    await service.checkForOrganization(ORG, WORK_DATE);

    expect(dayOf(firestore, 'mop-1')?.status).toBe('ON_TIME');
  });

  it.each(['ABSENT', 'DAY_OFF', 'EXCUSED'])('день со статусом %s', async (status) => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', { status });

    await service.checkForOrganization(ORG, WORK_DATE);

    expect(dayOf(firestore, 'mop-1')?.status).toBe(status);
  });
});

describe('повторная проверка', () => {
  it('возвращает день в зачёт, когда звонки догрузили', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', { status: 'LATE', lateMinutes: 7 });

    await service.checkForOrganization(ORG, WORK_DATE);
    expect(dayOf(firestore, 'mop-1')?.status).toBe('NOT_COUNTED');

    // Выгрузку Kcell загрузили утром — звонки за вчера появились.
    seedCalls(firestore, 'mop-1', 20, 18);
    const result = await service.checkForOrganization(ORG, WORK_DATE);

    expect(result.restored).toBe(1);
    expect(dayOf(firestore, 'mop-1')?.status).toBe('LATE');
  });

  it('не шлёт уведомление второй раз', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');

    await service.checkForOrganization(ORG, WORK_DATE);
    const result = await service.checkForOrganization(ORG, WORK_DATE);

    expect(result.notCounted).toBe(0);
    expect(firestore.all(COLLECTIONS.notifications)).toHaveLength(1);
  });
});

describe('ночной прогон', () => {
  it('проверяет вчерашний день организации один раз', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedDay(firestore, 'mop-1');

    // 16 сентября, 04:00 по Алматы.
    const now = new Date('2026-09-15T23:00:00Z');
    const [first] = await service.checkYesterdayEverywhere(now);
    const second = await service.checkYesterdayEverywhere(now);

    expect(first).toMatchObject({ workDate: WORK_DATE, notCounted: 1 });
    expect(second).toHaveLength(0);
  });
});
