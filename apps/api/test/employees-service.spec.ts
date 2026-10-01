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

describe('согласованность учётки и карточки', () => {
  it('сбой записи карточки удаляет созданную учётку', async () => {
    const { firestore, auth, service } = setup();
    // Занимаем идентификатор, который выдаст Auth: запись карточки упадёт.
    seedEmployee(firestore, 'uid-1');

    await expect(service.create(actor('HR'), newEmployee)).rejects.toThrow();

    // «Призрак» — учётка без карточки — пустил бы человека в систему,
    // где его формально не существует.
    expect(auth.record('uid-1')).toBeUndefined();
  });

  it('после отката адрес снова свободен', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'uid-1');

    await service.create(actor('HR'), newEmployee).catch(() => undefined);

    // Если бы учётка осталась, завести сотрудника повторно было бы нельзя.
    const retry = await service.create(actor('HR'), newEmployee);
    expect(retry.email).toBe('nurlan@corpsol.kz');
  });
});

describe('изменение карточки', () => {
  it('меняет только переданные поля', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1', { fullName: 'Старое имя' });

    const updated = await service.update(actor('HR'), 'mop-1', { fullName: 'Новое имя' });

    // Частичное обновление не должно обнулять оклад и отдел.
    expect(updated.fullName).toBe('Новое имя');
    expect(updated.baseSalaryMinor).toBe(25_000_000);
    expect(updated.departmentId).toBe('dep-1');
  });

  it('повышение до роли, которую актор выдавать не вправе, отклоняется', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');

    await expect(
      service.update(actor('HR'), 'mop-1', { role: 'DIRECTOR' }),
    ).rejects.toThrow(/не вправе выдавать роль/);
  });

  it('смена роли обновляет claims токена', async () => {
    const { firestore, auth, service } = setup();
    seedEmployee(firestore, 'mop-1');
    await auth.createUser({ uid: 'mop-1', email: 'mop-1@corpsol.kz', password: 'x' });

    await service.update(actor('HR'), 'mop-1', { role: 'ROP' });

    // Устаревшие claims оставили бы новому руководителю права менеджера.
    expect(auth.record('mop-1')?.claims).toEqual({ role: 'ROP' });
  });

  it('не трогает сотрудника чужой организации', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'alien', { organizationId: 'other-org' });

    await expect(
      service.update(actor('HR'), 'alien', { fullName: 'Взлом' }),
    ).rejects.toThrow(/не найден/);
  });

  it('перевод в чужой отдел отклоняется', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    firestore.seed(COLLECTIONS.departments, 'dep-alien', {
      organizationId: 'other-org',
      name: 'Чужой отдел',
    });

    await expect(
      service.update(actor('HR'), 'mop-1', { departmentId: 'dep-alien' }),
    ).rejects.toThrow(/Отдел не найден/);
  });
});

describe('увольнение', () => {
  const fire = async () => {
    const context = setup();
    seedEmployee(context.firestore, 'mop-1');
    await context.auth.createUser({ uid: 'mop-1', email: 'mop-1@corpsol.kz', password: 'x' });
    return context;
  };

  it('карточка сохраняется, но помечается уволенной', async () => {
    const { firestore, service } = await fire();

    await service.terminate(actor('HR'), 'mop-1');

    // Удалять карточку нельзя: на ней держатся табель, расчёты и история.
    const doc = firestore.read(COLLECTIONS.users, 'mop-1');
    expect(doc?.status).toBe('TERMINATED');
    expect(doc?.terminatedAt).toBeDefined();
  });

  it('учётка блокируется', async () => {
    const { auth, service } = await fire();

    await service.terminate(actor('HR'), 'mop-1');

    expect(auth.record('mop-1')?.disabled).toBe(true);
  });

  it('выданные токены отзываются сразу', async () => {
    const { auth, service } = await fire();

    await service.terminate(actor('HR'), 'mop-1');

    // Без отзыва уволенный работал бы до истечения последнего токена.
    expect(auth.record('mop-1')?.tokensRevokedAt).not.toBeNull();
  });

  it('телефон освобождается под нового сотрудника', async () => {
    const { devices, service } = await fire();

    await service.terminate(actor('HR'), 'mop-1');

    expect(devices.unbind).toHaveBeenCalledWith('mop-1', 'actor-1');
  });
});

describe('ограничения увольнения', () => {
  it('нельзя уволить самого себя', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'hr-1', { role: 'HR' });

    // Самоувольнение оставило бы организацию без кадровика
    // и выглядело бы в журнале как чужое действие.
    await expect(service.terminate(actor('HR', 'hr-1'), 'hr-1')).rejects.toThrow(/самого себя/);
  });

  it('повторное увольнение отклоняется', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1', { status: 'TERMINATED' });

    await expect(service.terminate(actor('HR'), 'mop-1')).rejects.toThrow(/уже уволен/);
  });

  it('ЧР не увольняет директора', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'director-1', { role: 'DIRECTOR' });

    await expect(
      service.terminate(actor('HR'), 'director-1'),
    ).rejects.toThrow(/не вправе управлять/);
  });

  it('не увольняет сотрудника чужой организации', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'alien', { organizationId: 'other-org' });

    await expect(service.terminate(actor('HR'), 'alien')).rejects.toThrow(/не найден/);
  });

  it('отсутствие привязанного телефона не срывает увольнение', async () => {
    const { firestore, auth } = setup();
    seedEmployee(firestore, 'mop-1');
    await auth.createUser({ uid: 'mop-1', email: 'mop-1@corpsol.kz', password: 'x' });

    const failingDevices = {
      unbind: jest.fn(async () => {
        throw new Error('У сотрудника нет привязанного устройства');
      }),
    } as unknown as DevicesService;
    const service = new EmployeesService(fakeFirebase(firestore, auth), failingDevices);

    await service.terminate(actor('HR'), 'mop-1');

    // Доступ важнее отвязки: уволенный не должен остаться в системе
    // из-за того, что телефона у него и не было.
    expect(auth.record('mop-1')?.disabled).toBe(true);
  });
});

describe('кто кого видит в списке', () => {
  const staffed = () => {
    const context = setup();
    seedEmployee(context.firestore, 'mop-1', { departmentId: 'dep-1', fullName: 'Болат' });
    seedEmployee(context.firestore, 'mop-2', { departmentId: 'dep-2', fullName: 'Алия' });
    seedEmployee(context.firestore, 'alien', { organizationId: 'other-org', fullName: 'Чужой' });
    return context;
  };

  it('ЧР видит всю организацию', async () => {
    const { service } = staffed();

    const list = await service.list(actor('HR'));

    expect(list).toHaveLength(2);
  });

  it('руководитель видит только свой отдел', async () => {
    const { service } = staffed();

    const list = await service.list(actor('ROP', 'rop-1', { departmentId: 'dep-1' }));

    expect(list.map((item) => item.id)).toEqual(['mop-1']);
  });

  it('руководитель без отдела получает отказ, а не всю компанию', async () => {
    const { service } = staffed();

    await expect(service.list(actor('ROP', 'rop-1'))).rejects.toThrow(/не привязан к отделу/);
  });

  it('сотрудники чужой организации не попадают в список', async () => {
    const { service } = staffed();

    const list = await service.list(actor('SUPER_ADMIN'));

    expect(list.some((item) => item.id === 'alien')).toBe(false);
  });
});

describe('уволенные в списке', () => {
  const withFired = () => {
    const context = setup();
    seedEmployee(context.firestore, 'mop-1', { fullName: 'Болат' });
    seedEmployee(context.firestore, 'mop-fired', {
      fullName: 'Уволенный',
      status: 'TERMINATED',
      terminatedAt: Timestamp.fromDate(new Date('2026-08-01T00:00:00Z')),
    });
    return context;
  };

  it('по умолчанию скрыты', async () => {
    const { service } = withFired();

    const list = await service.list(actor('HR'));

    // Рабочий список — про тех, кто работает сегодня.
    expect(list.map((item) => item.id)).toEqual(['mop-1']);
  });

  it('по запросу показываются', async () => {
    const { service } = withFired();

    const list = await service.list(actor('HR'), true);

    // История нужна для расчётов за прошлые периоды.
    expect(list).toHaveLength(2);
  });

  it('дата увольнения отдаётся строкой', async () => {
    const { service } = withFired();

    const list = await service.list(actor('HR'), true);
    const fired = list.find((item) => item.id === 'mop-fired');

    expect(fired?.terminatedAt).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('порядок в списке', () => {
  it('сортируется по имени с учётом кириллицы', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'u1', { fullName: 'Ялта' });
    seedEmployee(firestore, 'u2', { fullName: 'Болат' });
    seedEmployee(firestore, 'u3', { fullName: 'Айгерим' });

    const list = await service.list(actor('HR'));

    // Firestore сортирует по кодам символов, для русских имён это не алфавит.
    expect(list.map((item) => item.fullName)).toEqual(['Айгерим', 'Болат', 'Ялта']);
  });
});

describe('карточка одного сотрудника', () => {
  it('отдаётся своей организации', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1', { fullName: 'Болат' });

    const found = await service.findOne(actor('HR'), 'mop-1');

    expect(found.fullName).toBe('Болат');
  });

  it('несуществующий сотрудник не найден', async () => {
    const { service } = setup();

    await expect(service.findOne(actor('HR'), 'нет-такого')).rejects.toThrow(/не найден/);
  });

  it('чужая организация отвечает «не найден», а не «нет доступа»', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'alien', { organizationId: 'other-org' });

    // Ответ «нет доступа» подтвердил бы, что такой сотрудник существует.
    await expect(service.findOne(actor('HR'), 'alien')).rejects.toThrow(/не найден/);
  });

  it('руководитель не открывает карточку из чужого отдела', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-2', { departmentId: 'dep-2' });

    await expect(
      service.findOne(actor('ROP', 'rop-1', { departmentId: 'dep-1' }), 'mop-2'),
    ).rejects.toThrow(/не из вашего отдела/);
  });

  it('оклад отдаётся в тиынах без округления', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1', { baseSalaryMinor: 33_333_333 });

    const found = await service.findOne(actor('HR'), 'mop-1');

    expect(found.baseSalaryMinor).toBe(33_333_333);
  });
});

describe('журнал кадровых действий', () => {
  const events = (firestore: FakeFirestore) => firestore.all(COLLECTIONS.auditEvents);

  it('заведение записывается', async () => {
    const { firestore, service } = setup();

    await service.create(actor('HR', 'hr-1'), { ...newEmployee, role: 'ROP' });

    const [event] = events(firestore);
    expect(event.action).toBe('employee.create');
    expect(event.actorId).toBe('hr-1');
    expect(event.metadata).toEqual({ role: 'ROP' });
  });

  it('изменение записывается с перечнем полей', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');

    await service.update(actor('HR'), 'mop-1', { baseSalaryMinor: 30_000_000 });

    // Спор об окладе решается журналом: кто и когда менял сумму.
    const [event] = events(firestore);
    expect(event.action).toBe('employee.update');
    expect(event.metadata).toEqual({ fields: ['baseSalaryMinor', 'updatedAt'] });
  });

  it('увольнение записывается вместе с причиной', async () => {
    const { firestore, auth, service } = setup();
    seedEmployee(firestore, 'mop-1');
    await auth.createUser({ uid: 'mop-1', email: 'mop-1@corpsol.kz', password: 'x' });

    await service.terminate(actor('HR'), 'mop-1', 'Переход в другую компанию');

    const event = events(firestore).find((item) => item.action === 'employee.terminate');
    expect(event?.metadata).toEqual({ reason: 'Переход в другую компанию' });
  });

  it('все записи помечены организацией', async () => {
    const { firestore, service } = setup();

    await service.create(actor('HR'), newEmployee);

    // Без организации журнал одной компании был бы виден другой.
    expect(events(firestore).every((item) => item.organizationId === ORG)).toBe(true);
  });
});
