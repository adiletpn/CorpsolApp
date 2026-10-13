import {
  AlreadyBootstrapped,
  bootstrapOrganization,
  strongPassword,
} from '../src/bootstrap/organization-bootstrap';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeAuth, FakeFirestore } from './fake-firestore';

const INPUT = {
  organizationName: 'Колл-центр «Алатау»',
  timezone: 'Asia/Almaty',
  adminEmail: 'Admin@Example.KZ',
  adminName: 'Иван Иванов',
};

function setup() {
  const firestore = new FakeFirestore();
  const auth = new FakeAuth();
  return { firestore, auth };
}

const run = (
  context: ReturnType<typeof setup>,
  overrides: Partial<typeof INPUT> & { adminPassword?: string } = {},
) =>
  bootstrapOrganization(
    context.firestore as never,
    context.auth as never,
    { ...INPUT, ...overrides },
  );

describe('первый запуск в пустом проекте', () => {
  it('создаёт организацию с её часовым поясом', async () => {
    const context = setup();

    const result = await run(context);

    const organization = context.firestore.read(
      COLLECTIONS.organizations,
      result.organizationId,
    );
    expect(organization?.name).toBe('Колл-центр «Алатау»');
    expect(organization?.timezone).toBe('Asia/Almaty');
  });

  it('администратор привязан к созданной организации', async () => {
    const context = setup();

    const result = await run(context);

    // Учётка без организации проходит вход и упирается в пустую панель:
    // все запросы фильтруются по организации.
    const user = context.firestore.read(COLLECTIONS.users, result.uid);
    expect(user?.organizationId).toBe(result.organizationId);
    expect(user?.role).toBe('SUPER_ADMIN');
    expect(user?.status).toBe('ACTIVE');
  });

  it('роль проставлена и в токене', async () => {
    const context = setup();

    const result = await run(context);

    // Правила Firestore читают роль из токена, а не из базы.
    const account = await context.auth.getUser(result.uid);
    expect(account.customClaims).toEqual({ role: 'SUPER_ADMIN' });
  });

  it('почта приводится к нижнему регистру', async () => {
    const context = setup();

    const result = await run(context);

    // Вход по почте регистрозависимым быть не должен: админ введёт её
    // не так, как оператор при развёртывании.
    expect(context.firestore.read(COLLECTIONS.users, result.uid)?.email).toBe(
      'admin@example.kz',
    );
  });

  it('администратор не ставится в табель', async () => {
    const context = setup();

    const result = await run(context);

    // Иначе ночная задача начнёт ставить ему прогулы.
    const user = context.firestore.read(COLLECTIONS.users, result.uid);
    expect(user?.departmentId).toBeNull();
    expect(user?.officeId).toBeNull();
  });
});

describe('пароль администратора', () => {
  it('без заданного придумывается и показывается один раз', async () => {
    const context = setup();

    const result = await run(context);

    expect(result.generatedPassword).toHaveLength(24);
  });

  it('заданный оператором не возвращается обратно', async () => {
    const context = setup();

    const result = await run(context, { adminPassword: 'СвойПароль123!' });

    // Печатать то, что оператор и так знает, незачем — зато оно осядет
    // в логах развёртывания.
    expect(result.generatedPassword).toBeNull();
  });

  it('придуманные пароли не повторяются', () => {
    expect(strongPassword()).not.toBe(strongPassword());
  });

  it('в пароле нет похожих друг на друга знаков', () => {
    // Пароль показывают один раз и переписывают с экрана:
    // «l» против «I» и «O» против «0» там стоят дорого.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(strongPassword()).not.toMatch(/[lIO0]/);
    }
  });
});

describe('защита от повторного запуска', () => {
  it('поверх существующей организации не разворачивается', async () => {
    const context = setup();
    await run(context);

    // Вторая организация, к которой не привязан никто, — ошибка,
    // которую потом ищут долго.
    await expect(run(context, { adminEmail: 'second@example.kz' })).rejects.toBeInstanceOf(
      AlreadyBootstrapped,
    );
  });

  it('вторая организация не появляется', async () => {
    const context = setup();
    await run(context);

    await run(context).catch(() => null);

    expect(context.firestore.all(COLLECTIONS.organizations)).toHaveLength(1);
  });
});

describe('повторный заход после обрыва', () => {
  it('существующая учётка переиспользуется, а не ломает запуск', async () => {
    const context = setup();
    await context.auth.createUser({
      email: 'admin@example.kz',
      password: 'что-то-прежнее',
    });

    const result = await run(context);

    expect(result.reusedAccount).toBe(true);
    expect(context.firestore.read(COLLECTIONS.users, result.uid)).toBeDefined();
  });

  it('прежний пароль не выдаётся за новый', async () => {
    const context = setup();
    await context.auth.createUser({
      email: 'admin@example.kz',
      password: 'что-то-прежнее',
    });

    const result = await run(context);

    // Напечатать придуманный пароль, которым нельзя войти, — худшее,
    // что может сделать скрипт развёртывания.
    expect(result.generatedPassword).toBeNull();
  });
});
