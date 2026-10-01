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
