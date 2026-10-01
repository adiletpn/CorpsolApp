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
