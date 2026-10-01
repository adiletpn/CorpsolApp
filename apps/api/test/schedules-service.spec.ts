import { Timestamp } from 'firebase-admin/firestore';

import { SchedulesService } from '../src/schedules/schedules.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const admin = {
  id: 'admin',
  organizationId: ORG,
  email: 'admin@corpsol.kz',
  role: 'SUPER_ADMIN',
  departmentId: null,
  officeId: null,
  deviceId: null,
} as AuthenticatedUser;

const base = {
  departmentId: 'dep-1',
  startTime: '09:00',
  endTime: '18:00',
  workdays: [1, 2, 3, 4, 5],
};

function setup() {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.departments, 'dep-1', {
    organizationId: ORG,
    name: 'Продажи',
    headId: null,
  });
  firestore.seed(COLLECTIONS.users, 'mop-1', {
    organizationId: ORG,
    fullName: 'Болат Сериков',
    email: 'mop-1@corpsol.kz',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    baseSalaryMinor: 0,
  });

  return { firestore, service: new SchedulesService(fakeFirebase(firestore)) };
}

describe('кому принадлежит график', () => {
  it('создаётся на отдел', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, base);

    expect(schedule.departmentId).toBe('dep-1');
    expect(schedule.ownerName).toBe('Продажи');
  });

  it('создаётся на сотрудника', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, {
      ...base,
      departmentId: undefined,
      userId: 'mop-1',
    });

    expect(schedule.userId).toBe('mop-1');
    expect(schedule.ownerName).toBe('Болат Сериков');
  });

  it('нельзя задать отдел и сотрудника сразу', async () => {
    const { service } = setup();

    // Иначе непонятно, какой график считать действующим.
    await expect(
      service.create(admin, { ...base, userId: 'mop-1' }),
    ).rejects.toThrow(/либо отдел, либо сотрудника/);
  });

  it('нельзя создать график без владельца', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { ...base, departmentId: undefined }),
    ).rejects.toThrow(/либо отдел, либо сотрудника/);
  });

  it('отдел чужой организации отклоняется', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.departments, 'dep-alien', {
      organizationId: 'other-org',
      name: 'Чужой отдел',
      headId: null,
    });

    await expect(
      service.create(admin, { ...base, departmentId: 'dep-alien' }),
    ).rejects.toThrow(/Отдел не найден/);
  });

  it('сотрудник чужой организации отклоняется', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'alien', {
      organizationId: 'other-org',
      fullName: 'Чужой',
      email: 'alien@other.kz',
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: null,
      officeId: null,
      baseSalaryMinor: 0,
    });

    await expect(
      service.create(admin, { ...base, departmentId: undefined, userId: 'alien' }),
    ).rejects.toThrow(/Сотрудник не найден/);
  });
});

describe('границы смены', () => {
  it('конец раньше начала отклоняется', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { ...base, startTime: '18:00', endTime: '09:00' }),
    ).rejects.toThrow(/позже начала/);
  });

  it('смена нулевой длины отклоняется', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { ...base, startTime: '09:00', endTime: '09:00' }),
    ).rejects.toThrow(/позже начала/);
  });

  it('ночная смена через полночь пока не принимается', async () => {
    const { service } = setup();

    // Расчёт опоздания считает минуты от начала суток: на графике
    // 22:00–06:00 он посчитал бы приход в 22:00 опозданием на 16 часов.
    await expect(
      service.create(admin, { ...base, startTime: '22:00', endTime: '06:00' }),
    ).rejects.toThrow(/Ночные смены/);
  });

  it('смена в пределах одних суток принимается', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, {
      ...base,
      startTime: '08:30',
      endTime: '23:59',
    });

    expect(schedule.startTime).toBe('08:30');
    expect(schedule.endTime).toBe('23:59');
  });
});

describe('допуск на опоздание', () => {
  it('по умолчанию пять минут', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, base);

    expect(schedule.graceMinutes).toBe(5);
  });

  it('нулевой допуск сохраняется, а не подменяется умолчанием', async () => {
    const { service } = setup();

    // Ноль — осознанный выбор строгого режима, а не «значение не задано».
    const schedule = await service.create(admin, { ...base, graceMinutes: 0 });

    expect(schedule.graceMinutes).toBe(0);
  });

  it('заданный допуск сохраняется', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, { ...base, graceMinutes: 15 });

    expect(schedule.graceMinutes).toBe(15);
  });
});

describe('дни недели', () => {
  it('повторы убираются', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, { ...base, workdays: [1, 1, 3, 3, 3] });

    expect(schedule.workdays).toEqual([1, 3]);
  });

  it('порядок приводится к возрастающему', async () => {
    const { service } = setup();

    // В отчёте «пт, вт, пн» читается хуже, чем «пн, вт, пт».
    const schedule = await service.create(admin, { ...base, workdays: [5, 2, 1] });

    expect(schedule.workdays).toEqual([1, 2, 5]);
  });

  it('шестидневка сохраняется целиком', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, { ...base, workdays: [1, 2, 3, 4, 5, 6] });

    expect(schedule.workdays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('воскресенье как единственный рабочий день допустимо', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, { ...base, workdays: [7] });

    expect(schedule.workdays).toEqual([7]);
  });
});

describe('срок действия графика', () => {
  it('без указания действует с начала года', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, base);

    // График «с сегодня» не нашёлся бы при правке табеля за прошедшие дни,
    // и опоздание молча записалось бы как приход вовремя.
    const year = new Date().getUTCFullYear();
    expect(schedule.effectiveFrom).toBe(`${year}-01-01T00:00:00.000Z`);
  });

  it('заданная дата начала сохраняется', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, {
      ...base,
      effectiveFrom: '2026-03-01T00:00:00.000Z',
    });

    expect(schedule.effectiveFrom).toBe('2026-03-01T00:00:00.000Z');
  });

  it('бессрочный график не имеет даты окончания', async () => {
    const { service } = setup();

    const schedule = await service.create(admin, base);

    expect(schedule.effectiveTo).toBeNull();
  });

  it('окончание раньше начала отклоняется', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, {
        ...base,
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        effectiveTo: '2026-03-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/раньше его начала/);
  });

  it('совпадение начала и окончания отклоняется', async () => {
    const { service } = setup();

    // График нулевой длительности не действует ни одного дня.
    await expect(
      service.create(admin, {
        ...base,
        effectiveFrom: '2026-06-01T00:00:00.000Z',
        effectiveTo: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/раньше его начала/);
  });
});

describe('список графиков', () => {
  it('показывает имя владельца, а не идентификатор', async () => {
    const { service } = setup();
    await service.create(admin, base);

    const [schedule] = await service.list(admin);

    // В списке «dep-1» ничего не говорит администратору.
    expect(schedule.ownerName).toBe('Продажи');
  });

  it('личный график подписан именем сотрудника', async () => {
    const { service } = setup();
    await service.create(admin, { ...base, departmentId: undefined, userId: 'mop-1' });

    const [schedule] = await service.list(admin);

    expect(schedule.ownerName).toBe('Болат Сериков');
  });

  it('графики чужой организации не видны', async () => {
    const { firestore, service } = setup();
    await service.create(admin, base);
    firestore.seed(COLLECTIONS.workSchedules, 'alien', {
      departmentId: 'dep-alien',
      userId: null,
      startTime: '10:00',
      endTime: '19:00',
      graceMinutes: 5,
      workdays: [1],
      effectiveFrom: Timestamp.now(),
      effectiveTo: null,
    });

    // Коллекция графиков общая, организация определяется через владельца.
    const list = await service.list(admin);

    expect(list).toHaveLength(1);
  });

  it('сортируется по имени владельца', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.departments, 'dep-2', {
      organizationId: ORG,
      name: 'Аналитика',
      headId: null,
    });
    await service.create(admin, base);
    await service.create(admin, { ...base, departmentId: 'dep-2' });

    const list = await service.list(admin);

    expect(list.map((item) => item.ownerName)).toEqual(['Аналитика', 'Продажи']);
  });

  it('пустой список не ошибка', async () => {
    const { service } = setup();

    await expect(service.list(admin)).resolves.toEqual([]);
  });
});
