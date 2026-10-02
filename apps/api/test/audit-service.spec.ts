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

describe('отбор ручных обходов контроля', () => {
  const mixed = () => {
    const context = setup();
    seedEvent(context.firestore, 'adjust', { action: 'attendance.adjust' });
    seedEvent(context.firestore, 'unbind', { action: 'device.unbind' });
    seedEvent(context.firestore, 'terminate', { action: 'employee.terminate' });
    seedEvent(context.firestore, 'create', { action: 'employee.create' });
    seedEvent(context.firestore, 'update', { action: 'employee.update' });
    return context;
  };

  it('показывает только обходы автоматического контроля', async () => {
    const { service } = mixed();

    const events = await service.list(director, { sensitiveOnly: true });

    // Смысл системы — автоматический контроль. Ручные обходы — то,
    // ради чего журнал вообще заведён.
    expect(events.map((item) => item.action).sort()).toEqual([
      'attendance.adjust',
      'device.unbind',
      'employee.terminate',
    ]);
  });

  it('без отбора показывает всё', async () => {
    const { service } = mixed();

    const events = await service.list(director);

    expect(events).toHaveLength(5);
  });

  it('отбор по конкретному действию', async () => {
    const { service } = mixed();

    const events = await service.list(director, { action: 'device.unbind' });

    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('device.unbind');
  });

  it('заведение сотрудника обходом не считается', async () => {
    const { service } = mixed();

    const events = await service.list(director, { sensitiveOnly: true });

    // Приём на работу идёт обычным порядком и внимания не требует.
    expect(events.some((item) => item.action === 'employee.create')).toBe(false);
  });
});

describe('порядок и объём выборки', () => {
  const dated = () => {
    const context = setup();
    const days = ['2026-09-10', '2026-09-20', '2026-09-15', '2026-09-05'];
    days.forEach((day, index) => {
      seedEvent(context.firestore, `e${index}`, {
        createdAt: Timestamp.fromDate(new Date(`${day}T10:00:00Z`)),
      });
    });
    return context;
  };

  it('новые события идут первыми', async () => {
    const { service } = dated();

    const events = await service.list(director);

    // Журнал открывают, чтобы увидеть последнее, а не самое старое.
    expect(events.map((item) => item.createdAt.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-09-15',
      '2026-09-10',
      '2026-09-05',
    ]);
  });

  it('ограничение отсекает хвост, а не начало', async () => {
    const { service } = dated();

    const events = await service.list(director, { limit: 2 });

    expect(events.map((item) => item.createdAt.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-09-15',
    ]);
  });
});
