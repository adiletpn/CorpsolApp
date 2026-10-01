import { Timestamp } from 'firebase-admin/firestore';

import { EmployeesService } from '../src/employees/employees.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { DevicesService } from '../src/devices/devices.service';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeAuth, FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const actor = (
  role: AuthenticatedUser['role'],
  id = 'actor-1',
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

/** Отвязку устройства проверяет свой набор тестов — здесь важен только факт вызова. */
const fakeDevices = () =>
  ({ unbind: jest.fn(async () => undefined) }) as unknown as DevicesService & {
    unbind: jest.Mock;
  };

function setup() {
  const firestore = new FakeFirestore();
  const auth = new FakeAuth();
  const devices = fakeDevices();

  firestore.seed(COLLECTIONS.departments, 'dep-1', { organizationId: ORG, name: 'Продажи' });
  firestore.seed(COLLECTIONS.offices, 'office-1', { organizationId: ORG, name: 'Головной' });

  return {
    firestore,
    auth,
    devices,
    service: new EmployeesService(fakeFirebase(firestore, auth), devices),
  };
}

function seedEmployee(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    email: `${id}@corpsol.kz`,
    phone: null,
    fullName: `Сотрудник ${id}`,
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    hiredAt: Timestamp.fromDate(new Date('2026-01-10T00:00:00Z')),
    terminatedAt: null,
    baseSalaryMinor: 25_000_000,
    currency: 'KZT',
    ...fields,
  });
}

const newEmployee = {
  email: 'Nurlan@Corpsol.KZ',
  fullName: 'Нурлан Сериков',
  role: 'MOP' as const,
};

describe('кого какая роль вправе заводить', () => {
  it('ЧР заводит менеджера', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), newEmployee);

    expect(created.role).toBe('MOP');
  });

  it('ЧР не заводит второго ЧР', async () => {
    const { service } = setup();

    // Иначе любой кадровик расширял бы свой круг бесконтрольно.
    await expect(
      service.create(actor('HR'), { ...newEmployee, role: 'HR' }),
    ).rejects.toThrow(/не вправе выдавать роль/);
  });

  it('ЧР не заводит супер-админа', async () => {
    const { service } = setup();

    await expect(
      service.create(actor('HR'), { ...newEmployee, role: 'SUPER_ADMIN' }),
    ).rejects.toThrow(/не вправе выдавать роль/);
  });

  it('отказ происходит до создания учётки', async () => {
    const { auth, service } = setup();

    await service
      .create(actor('HR'), { ...newEmployee, role: 'DIRECTOR' })
      .catch(() => undefined);

    // Учётка, созданная перед отказом, осталась бы работающим входом в систему.
    expect(auth.size).toBe(0);
  });
});

describe('адрес почты при заведении', () => {
  it('приводится к нижнему регистру', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), newEmployee);

    // Вход сверяет адрес точно, а кадровик вводит его как придётся.
    expect(created.email).toBe('nurlan@corpsol.kz');
  });

  it('повторное заведение отклоняется', async () => {
    const { service } = setup();
    await service.create(actor('HR'), newEmployee);

    await expect(service.create(actor('HR'), newEmployee)).rejects.toThrow(/уже заведён/);
  });

  it('различие в регистре не считается новым сотрудником', async () => {
    const { service } = setup();
    await service.create(actor('HR'), { ...newEmployee, email: 'nurlan@corpsol.kz' });

    // Иначе на одного человека завелись бы две карточки и два табеля.
    await expect(
      service.create(actor('HR'), { ...newEmployee, email: 'NURLAN@CORPSOL.KZ' }),
    ).rejects.toThrow(/уже заведён/);
  });
});

describe('отдел и офис при заведении', () => {
  it('принимает отдел своей организации', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), {
      ...newEmployee,
      departmentId: 'dep-1',
    });

    expect(created.departmentId).toBe('dep-1');
  });

  it('отклоняет несуществующий отдел', async () => {
    const { service } = setup();

    await expect(
      service.create(actor('HR'), { ...newEmployee, departmentId: 'нет-такого' }),
    ).rejects.toThrow(/Отдел не найден/);
  });

  it('отклоняет отдел чужой организации', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.departments, 'dep-alien', {
      organizationId: 'other-org',
      name: 'Чужой отдел',
    });

    // Сотрудник в чужом отделе попал бы в чужие отчёты и рейтинги.
    await expect(
      service.create(actor('HR'), { ...newEmployee, departmentId: 'dep-alien' }),
    ).rejects.toThrow(/Отдел не найден/);
  });

  it('отклоняет офис чужой организации', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.offices, 'office-alien', {
      organizationId: 'other-org',
      name: 'Чужой офис',
    });

    await expect(
      service.create(actor('HR'), { ...newEmployee, officeId: 'office-alien' }),
    ).rejects.toThrow(/Офис не найден/);
  });

  it('без отдела и офиса сотрудник заводится', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), newEmployee);

    expect(created.departmentId).toBeNull();
    expect(created.officeId).toBeNull();
  });
});

describe('учётная запись нового сотрудника', () => {
  it('выдаёт временный пароль', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), newEmployee);

    // Пароль показывается кадровику один раз — передать его сотруднику больше нечем.
    expect(created.temporaryPassword).toEqual(expect.any(String));
    expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });

  it('пароль каждый раз новый', async () => {
    const { service } = setup();

    const first = await service.create(actor('HR'), newEmployee);
    const second = await service.create(actor('HR'), {
      ...newEmployee,
      email: 'aigerim@corpsol.kz',
    });

    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });

  it('кладёт роль в claims токена', async () => {
    const { auth, service } = setup();

    const created = await service.create(actor('HR'), { ...newEmployee, role: 'ROP' });

    // Правила Firestore читают роль из токена, а не из базы.
    expect(auth.record(created.id)?.claims).toEqual({ role: 'ROP' });
  });

  it('сотрудник заводится активным', async () => {
    const { service } = setup();

    const created = await service.create(actor('HR'), newEmployee);

    expect(created.status).toBe('ACTIVE');
    expect(created.terminatedAt).toBeNull();
  });
});
