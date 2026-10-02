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

describe('кто автор действия', () => {
  it('идентификатор заменяется именем', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'e1', { actorId: 'hr-1' });

    const [event] = await service.list(director);

    // «hr-1» в отчёте не отвечает на вопрос, кто это сделал.
    expect(event.actor).toEqual({ id: 'hr-1', fullName: 'Айгерим Нурланова' });
  });

  it('удалённая учётка не скрывает событие', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'e1', { actorId: 'уже-удалён' });

    const [event] = await service.list(director);

    // Событие важнее автора: пропажа учётки не должна стирать след.
    expect(event.actor).toEqual({ id: 'уже-удалён', fullName: 'Учётная запись удалена' });
  });

  it('системное событие без автора допустимо', async () => {
    const { firestore, service } = setup();
    seedEvent(firestore, 'e1', { actorId: null });

    const [event] = await service.list(director);

    expect(event.actor).toBeNull();
  });

  it('имя одного автора читается один раз на всю выборку', async () => {
    const { firestore, service } = setup();
    for (let index = 1; index <= 5; index += 1) {
      seedEvent(firestore, `e${index}`, { actorId: 'hr-1' });
    }

    const events = await service.list(director);

    // Пять одинаковых чтений Firestore — пять оплаченных операций впустую.
    expect(events).toHaveLength(5);
    expect(events.every((item) => item.actor?.fullName === 'Айгерим Нурланова')).toBe(true);
  });
});
