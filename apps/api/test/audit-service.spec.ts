import { Timestamp } from 'firebase-admin/firestore';

import { AuditService } from '../src/audit/audit.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const director = {
  id: 'dir-1',
  organizationId: ORG,
  email: 'dir@corpsol.kz',
  role: 'DIRECTOR',
  departmentId: null,
  officeId: null,
  deviceId: null,
} as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.users, 'hr-1', {
    organizationId: ORG,
    fullName: 'Айгерим Нурланова',
    email: 'hr@corpsol.kz',
    role: 'HR',
    status: 'ACTIVE',
    departmentId: null,
    officeId: null,
    baseSalaryMinor: 0,
  });

  return { firestore, service: new AuditService(fakeFirebase(firestore)) };
}

function seedEvent(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.auditEvents, id, {
    organizationId: ORG,
    actorId: 'hr-1',
    action: 'employee.update',
    targetType: 'User',
    targetId: 'mop-1',
    metadata: {},
    ip: null,
    createdAt: Timestamp.fromDate(new Date('2026-09-15T10:00:00Z')),
    ...fields,
  });
}

describe('что попадает в журнал', () => {
  it('события чужой организации не видны', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'ours');
    seedEvent(firestore, 'alien', { organizationId: 'other-org' });

    const events = await service.list(director);

    // Журнал одной компании в чужом отчёте — утечка кадровых решений.
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('ours');
  });

  it('пустой журнал не ошибка', async () => {
    const { service } = setup();

    await expect(service.list(director)).resolves.toEqual([]);
  });

  it('подробности события сохраняются целиком', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'e1', {
      action: 'employee.terminate',
      metadata: { reason: 'Переход в другую компанию' },
    });

    const [event] = await service.list(director);

    expect(event.action).toBe('employee.terminate');
    expect(event.targetType).toBe('User');
    expect(event.metadata).toEqual({ reason: 'Переход в другую компанию' });
  });

  it('время отдаётся строкой', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'e1');

    const [event] = await service.list(director);

    expect(event.createdAt).toBe('2026-09-15T10:00:00.000Z');
  });
});
