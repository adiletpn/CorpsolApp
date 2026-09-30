import { Timestamp } from 'firebase-admin/firestore';

import { CallsService } from '../src/calls/calls.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const actor = (role: AuthenticatedUser['role'], extra: Partial<AuthenticatedUser> = {}) =>
  ({
    id: 'mop-1',
    organizationId: ORG,
    email: 'test@corpsol.kz',
    role,
    departmentId: 'dep-1',
    officeId: null,
    deviceId: 'phone-1',
    ...extra,
  }) as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new CallsService(fakeFirebase(firestore)) };
}

function seedCall(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.calls, id, {
    userId: 'mop-1',
    organizationId: ORG,
    departmentId: 'dep-1',
    source: 'KCELL',
    direction: 'OUTBOUND',
    status: 'ANSWERED',
    clientPhone: '+77071112233',
    callDate: '2026-09-15',
    startedAt: Timestamp.fromDate(new Date('2026-09-15T09:00:00Z')),
    durationSeconds: 120,
    talkSeconds: 120,
    recordingUrl: null,
    importedAt: Timestamp.now(),
    ...fields,
  });
}

describe('кто какие звонки видит', () => {
  it('менеджер видит только свои', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'mine', { userId: 'mop-1' });
    seedCall(firestore, 'colleague', { userId: 'mop-2' });

    const calls = await service.list(actor('MOP'));

    // По ТЗ менеджер видит только свои звонки.
    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe('mop-1');
  });

  it('руководитель видит весь свой отдел', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'a', { userId: 'mop-1', departmentId: 'dep-1' });
    seedCall(firestore, 'b', { userId: 'mop-2', departmentId: 'dep-1' });
    seedCall(firestore, 'other', { userId: 'mop-3', departmentId: 'dep-2' });

    const calls = await service.list(actor('ROP'));

    expect(calls).toHaveLength(2);
  });

  it('руководитель может отобрать одного подчинённого', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'a', { userId: 'mop-1' });
    seedCall(firestore, 'b', { userId: 'mop-2' });

    const calls = await service.list(actor('ROP'), undefined, undefined, 'mop-2');

    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe('mop-2');
  });

  it('директор видит всю компанию', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'a', { departmentId: 'dep-1' });
    seedCall(firestore, 'b', { departmentId: 'dep-2' });

    const calls = await service.list(actor('DIRECTOR', { departmentId: null }));

    expect(calls).toHaveLength(2);
  });

  it('звонки чужой организации не видит никто', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'ours', { organizationId: ORG });
    seedCall(firestore, 'alien', { organizationId: 'other-org' });

    const calls = await service.list(actor('DIRECTOR', { departmentId: null }));

    expect(calls).toHaveLength(1);
  });

  it('руководитель без отдела получает отказ, а не чужие данные', async () => {
    const { service } = setup();

    await expect(service.list(actor('ROP', { departmentId: null }))).rejects.toThrow();
  });
});

describe('отбор по периоду', () => {
  it('берёт только звонки внутри границ', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'before', { callDate: '2026-08-31' });
    seedCall(firestore, 'start', { callDate: '2026-09-01' });
    seedCall(firestore, 'middle', { callDate: '2026-09-15' });
    seedCall(firestore, 'end', { callDate: '2026-09-30' });
    seedCall(firestore, 'after', { callDate: '2026-10-01' });

    const calls = await service.list(actor('MOP'), '2026-09-01', '2026-09-30');

    // Границы включаются в период — иначе терялись бы первый и последний день.
    expect(calls).toHaveLength(3);
  });
});

describe('сводка по звонкам', () => {
  it('считает разговоры отдельно от набранных номеров', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'a', { status: 'ANSWERED', talkSeconds: 120 });
    seedCall(firestore, 'b', { status: 'ANSWERED', talkSeconds: 90 });
    seedCall(firestore, 'c', { status: 'NO_ANSWER', talkSeconds: 0 });
    seedCall(firestore, 'd', { status: 'BUSY', talkSeconds: 0 });

    const summary = await service.summary(actor('MOP'));

    expect(summary.total).toBe(4);
    expect(summary.answered).toBe(2);
  });

  it('минуты округляет вниз', async () => {
    const { firestore, service } = setup();
    // 4 минуты 30 секунд разговора суммарно.
    seedCall(firestore, 'a', { talkSeconds: 150 });
    seedCall(firestore, 'b', { talkSeconds: 120 });

    const summary = await service.summary(actor('MOP'));

    // Показывать 5 минут при четырёх с половиной значит завышать отчёт.
    expect(summary.talkMinutes).toBe(4);
  });

  it('не считает время неотвеченных звонков', async () => {
    const { firestore, service } = setup();
    seedCall(firestore, 'missed', { status: 'NO_ANSWER', talkSeconds: 300 });

    const summary = await service.summary(actor('MOP'));

    expect(summary.talkMinutes).toBe(0);
  });

  it('на пустом периоде возвращает нули, а не ошибку', async () => {
    const { service } = setup();

    const summary = await service.summary(actor('MOP'));

    expect(summary).toEqual({ total: 0, answered: 0, talkMinutes: 0 });
  });
});
