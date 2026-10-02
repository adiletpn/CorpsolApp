import { WorkNumbersService } from '../src/calls/work-numbers.service';
import { COLLECTIONS, externalIdentityDocId } from '../src/firestore/collections';
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

  const employee = (id: string, fullName: string, organizationId = ORG) => {
    firestore.seed(COLLECTIONS.users, id, {
      organizationId,
      fullName,
      email: `${id}@corpsol.kz`,
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: 'dep-1',
      officeId: null,
      baseSalaryMinor: 0,
    });
  };

  employee('mop-1', 'Болат Сериков');
  employee('mop-2', 'Айгерим Нурланова');
  employee('alien', 'Чужой сотрудник', 'other-org');

  return { firestore, service: new WorkNumbersService(fakeFirebase(firestore)) };
}

describe('формат рабочего номера', () => {
  it('приводится к единому виду', async () => {
    const { service } = setup();

    const link = await service.link(admin, 'mop-1', '8 (707) 111-22-33', 'KCELL');

    // Выгрузка оператора и кадровик пишут номер по-разному,
    // а сопоставление звонков сверяет строки точно.
    expect(link.workNumber).toBe('+77071112233');
  });

  it('разные записи одного номера дают одну привязку', async () => {
    const { firestore, service } = setup();

    await service.link(admin, 'mop-1', '+7 707 111 22 33', 'KCELL');
    await service.link(admin, 'mop-1', '87071112233', 'KCELL');

    // Иначе на одного человека завелись бы две привязки к одному номеру.
    expect(firestore.all(COLLECTIONS.externalIdentities)).toHaveLength(1);
  });

  it('мусор вместо номера отклоняется', async () => {
    const { service } = setup();

    await expect(
      service.link(admin, 'mop-1', 'добавочный 101', 'KCELL'),
    ).rejects.toThrow(/Не похоже на номер/);
  });

  it('пустая строка отклоняется', async () => {
    const { service } = setup();

    await expect(service.link(admin, 'mop-1', '', 'KCELL')).rejects.toThrow();
  });
});

describe('один номер — один сотрудник', () => {
  it('занятый номер не перевешивается на другого', async () => {
    const { service } = setup();
    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');

    // Иначе звонки первого сотрудника задним числом ушли бы второму.
    await expect(
      service.link(admin, 'mop-2', '+77071112233', 'KCELL'),
    ).rejects.toThrow(/уже закреплён за другим/);
  });

  it('повторная привязка к тому же сотруднику проходит', async () => {
    const { service } = setup();
    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');

    const link = await service.link(admin, 'mop-1', '+77071112233', 'KCELL');

    expect(link.userId).toBe('mop-1');
  });

  it('один номер в разных источниках — разные привязки', async () => {
    const { firestore, service } = setup();

    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');
    await service.link(admin, 'mop-2', '+77071112233', 'BITRIX');

    // Нумерация Kcell и Bitrix24 независимы, пересечение случайно.
    expect(firestore.all(COLLECTIONS.externalIdentities)).toHaveLength(2);
  });

  it('у сотрудника может быть несколько номеров', async () => {
    const { service } = setup();

    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');
    await service.link(admin, 'mop-1', '+77071112244', 'KCELL');

    const links = await service.list(admin);
    expect(links.filter((item) => item.userId === 'mop-1')).toHaveLength(2);
  });

  it('номер нельзя закрепить за чужим сотрудником', async () => {
    const { service } = setup();

    await expect(
      service.link(admin, 'alien', '+77071112233', 'KCELL'),
    ).rejects.toThrow(/не найден/);
  });
});

describe('список привязок', () => {
  it('подписан именем сотрудника', async () => {
    const { service } = setup();
    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');

    const [link] = await service.list(admin);

    expect(link.fullName).toBe('Болат Сериков');
  });

  it('привязка уволенного не теряется', async () => {
    const { firestore, service } = setup();
    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');
    firestore.seed(COLLECTIONS.users, 'mop-1', {});

    const [link] = await service.list(admin);

    // Номер остаётся занятым: по нему всё ещё разложены прошлые звонки.
    expect(link.fullName).toBe('Сотрудник удалён');
    expect(link.workNumber).toBe('+77071112233');
  });

  it('привязки чужой организации не видны', async () => {
    const { firestore, service } = setup();
    await service.link(admin, 'mop-1', '+77071112233', 'KCELL');
    firestore.seed(
      COLLECTIONS.externalIdentities,
      externalIdentityDocId('KCELL', '+77079998877'),
      {
        userId: 'alien',
        provider: 'KCELL',
        externalKey: '+77079998877',
        organizationId: 'other-org',
      },
    );

    const links = await service.list(admin);

    expect(links).toHaveLength(1);
  });

  it('пустой список не ошибка', async () => {
    const { service } = setup();

    await expect(service.list(admin)).resolves.toEqual([]);
  });
});
