import { DepartmentsService } from '../src/departments/departments.service';
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

function setup() {
  const firestore = new FakeFirestore();

  const employee = (id: string, role: string, status = 'ACTIVE', organizationId = ORG) => {
    firestore.seed(COLLECTIONS.users, id, {
      organizationId,
      fullName: `Сотрудник ${id}`,
      email: `${id}@corpsol.kz`,
      role,
      status,
      departmentId: null,
      officeId: null,
      baseSalaryMinor: 0,
    });
  };

  employee('rop-1', 'ROP');
  employee('rop-2', 'ROP');
  employee('mop-1', 'MOP');
  employee('director-1', 'DIRECTOR');
  employee('rop-fired', 'ROP', 'TERMINATED');
  employee('rop-alien', 'ROP', 'ACTIVE', 'other-org');

  return { firestore, service: new DepartmentsService(fakeFirebase(firestore)) };
}

describe('кто может руководить отделом', () => {
  it('назначает руководителем сотрудника с ролью РОП', async () => {
    const { service } = setup();

    const department = await service.create(admin, { name: 'Отдел продаж', headId: 'rop-1' });

    expect(department.head?.id).toBe('rop-1');
  });

  it('не назначает менеджера', async () => {
    const { service } = setup();

    // Права выдаются по роли: менеджер числился бы главой отдела,
    // не видя ни отдела, ни его показателей.
    await expect(
      service.create(admin, { name: 'Отдел', headId: 'mop-1' }),
    ).rejects.toThrow(/только РОП/);
  });

  it('не назначает директора', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { name: 'Отдел', headId: 'director-1' }),
    ).rejects.toThrow(/только РОП/);
  });

  it('не назначает уволенного', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { name: 'Отдел', headId: 'rop-fired' }),
    ).rejects.toThrow(/неактивного/);
  });

  it('не назначает сотрудника чужой организации', async () => {
    const { service } = setup();

    await expect(
      service.create(admin, { name: 'Отдел', headId: 'rop-alien' }),
    ).rejects.toThrow();
  });
});

describe('состав отдела', () => {
  it('назначенный руководитель попадает в свой отдел', async () => {
    const { firestore, service } = setup();

    const department = await service.create(admin, { name: 'Отдел', headId: 'rop-1' });

    // Иначе его собственные показатели не попали бы в отчёты отдела,
    // которым он руководит.
    const head = firestore.read(COLLECTIONS.users, 'rop-1');
    expect(head?.departmentId).toBe(department.id);
  });

  it('считает только активных сотрудников', async () => {
    const { firestore, service } = setup();
    const department = await service.create(admin, { name: 'Отдел' });

    firestore.seed(COLLECTIONS.users, 'mop-1', {
      ...firestore.read(COLLECTIONS.users, 'mop-1')!,
      departmentId: department.id,
    });
    firestore.seed(COLLECTIONS.users, 'rop-fired', {
      ...firestore.read(COLLECTIONS.users, 'rop-fired')!,
      departmentId: department.id,
    });

    const [view] = await service.list(admin);

    expect(view.memberCount).toBe(1);
  });

  it('отдел создаётся и без руководителя', async () => {
    const { service } = setup();

    const department = await service.create(admin, { name: 'Новый отдел' });

    expect(department.head).toBeNull();
    expect(department.memberCount).toBe(0);
  });
});

describe('смена руководителя', () => {
  it('назначает нового и переводит его в отдел', async () => {
    const { firestore, service } = setup();
    const department = await service.create(admin, { name: 'Отдел', headId: 'rop-1' });

    const updated = await service.update(admin, department.id, { headId: 'rop-2' });

    expect(updated.head?.id).toBe('rop-2');
    expect(firestore.read(COLLECTIONS.users, 'rop-2')?.departmentId).toBe(department.id);
  });

  it('не ставит руководителем менеджера при изменении', async () => {
    const { service } = setup();
    const department = await service.create(admin, { name: 'Отдел', headId: 'rop-1' });

    await expect(
      service.update(admin, department.id, { headId: 'mop-1' }),
    ).rejects.toThrow(/только РОП/);
  });

  it('не отдаёт отдел чужой организации', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.departments, 'alien', {
      organizationId: 'other-org',
      name: 'Чужой отдел',
      headId: null,
    });

    await expect(service.findOne(admin, 'alien')).rejects.toThrow();
  });
});
