import { Timestamp } from 'firebase-admin/firestore';

import { AnalyticsService } from '../src/analytics/analytics.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { PlansService } from '../src/plans/plans.service';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const actor = (
  role: AuthenticatedUser['role'],
  id = 'dir-1',
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

/** Измерение планов проверяется своим набором тестов — здесь оно подменяется. */
const fakePlans = (options: { user?: number[]; plan?: number } = {}) =>
  ({
    progressForUser: jest.fn(async () => (options.user ?? []).map((ratio) => ({ ratio }))),
    progressForPlan: jest.fn(async () => ({ ratio: options.plan ?? 0 })),
  }) as unknown as PlansService;

function setup(plans = fakePlans()) {
  const firestore = new FakeFirestore();
  return { firestore, service: new AnalyticsService(fakeFirebase(firestore), plans) };
}

function seedUser(firestore: FakeFirestore, id: string, fields: Record<string, unknown> = {}) {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    fullName: `Сотрудник ${id}`,
    email: `${id}@corpsol.kz`,
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    baseSalaryMinor: 0,
    ...fields,
  });
}

function seedDepartment(firestore: FakeFirestore, id: string, name: string) {
  firestore.seed(COLLECTIONS.departments, id, { organizationId: ORG, name, headId: null });
}

function seedDay(
  firestore: FakeFirestore,
  userId: string,
  date: string,
  status: string,
  lateMinutes = 0,
) {
  firestore.seed(COLLECTIONS.attendance, `${userId}_${date}`, {
    userId,
    organizationId: ORG,
    departmentId: 'dep-1',
    workDate: date,
    status,
    lateMinutes,
  });
}

function seedOffer(
  firestore: FakeFirestore,
  id: string,
  userId: string,
  amountMinor: number,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.offers, id, {
    userId,
    organizationId: ORG,
    departmentId: 'dep-1',
    clientName: 'Клиент',
    clientPhone: null,
    amountMinor,
    status: 'ACCEPTED',
    sentAt: Timestamp.now(),
    sentDate: '2026-09-15',
    resolvedAt: Timestamp.now(),
    ...fields,
  });
}

describe('кто попадает в показатели работы', () => {
  it('считаются менеджеры и руководители', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'rop-1', { role: 'ROP' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(2);
  });

  it('директор и кадровик в показателях не участвуют', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'dir-1', { role: 'DIRECTOR' });
    seedUser(firestore, 'hr-1', { role: 'HR' });

    // Их посещаемость не про работу с клиентами и смазала бы картину.
    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });

  it('уволенные в показателях не участвуют', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'mop-fired', { status: 'TERMINATED' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });

  it('чужая организация не попадает в сводку', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedUser(firestore, 'alien', { organizationId: 'other-org' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.headcount).toBe(1);
  });
});

describe('выручка в сводке', () => {
  it('складывает подтверждённые сделки', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedOffer(firestore, 'o1', 'mop-1', 300_000);
    seedOffer(firestore, 'o2', 'mop-1', 700_000);

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.acceptedOffers).toBe(2);
    expect(stats.revenueMinor).toBe(1_000_000);
  });

  it('не считает выручкой отправленные и отклонённые', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedOffer(firestore, 'sent', 'mop-1', 500_000, { status: 'SENT' });
    seedOffer(firestore, 'rejected', 'mop-1', 900_000, { status: 'REJECTED' });

    // Отправленное предложение — ещё не деньги компании.
    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.revenueMinor).toBe(0);
  });

  it('не считает сделки за пределами периода', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedOffer(firestore, 'inside', 'mop-1', 100_000, { sentDate: '2026-09-15' });
    seedOffer(firestore, 'before', 'mop-1', 400_000, { sentDate: '2026-08-31' });
    seedOffer(firestore, 'after', 'mop-1', 800_000, { sentDate: '2026-10-01' });

    const stats = await service.company(actor('DIRECTOR'), PERIOD.start, PERIOD.end);

    expect(stats.revenueMinor).toBe(100_000);
  });

  it('сделка уволенного не теряется из выручки отдела', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedOffer(firestore, 'o1', 'mop-1', 250_000);

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.revenueMinor).toBe(250_000);
  });
});

describe('табель в показателях', () => {
  it('разносит дни по видам', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', '2026-09-01', 'ON_TIME');
    seedDay(firestore, 'mop-1', '2026-09-02', 'ON_TIME');
    seedDay(firestore, 'mop-1', '2026-09-03', 'LATE', 15);
    seedDay(firestore, 'mop-1', '2026-09-04', 'ABSENT');

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    const employee = stats.employees?.[0];
    // Пришёл трижды из четырёх, вовремя — дважды из трёх.
    expect(employee?.rates.attendanceRate).toBeCloseTo(0.75);
    expect(employee?.rates.punctualityRate).toBeCloseTo(2 / 3);
    expect(employee?.rates.averageLateMinutes).toBe(15);
  });

  it('выходные и уважительные причины не портят показатели', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', '2026-09-01', 'ON_TIME');
    seedDay(firestore, 'mop-1', '2026-09-02', 'DAY_OFF');
    seedDay(firestore, 'mop-1', '2026-09-03', 'EXCUSED');

    // Иначе отпуск выглядел бы как прогул.
    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.employees?.[0].rates.expectedDays).toBe(1);
    expect(stats.employees?.[0].rates.attendanceRate).toBe(1);
  });

  it('дни за пределами периода не учитываются', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    seedDay(firestore, 'mop-1', '2026-09-01', 'ON_TIME');
    seedDay(firestore, 'mop-1', '2026-08-15', 'ABSENT');

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.employees?.[0].rates.expectedDays).toBe(1);
    expect(stats.employees?.[0].rates.attendanceRate).toBe(1);
  });

  it('сотрудник без единой отметки не ломает расчёт', async () => {
    const { firestore, service } = setup();
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    // Деление на ноль здесь обрушило бы весь экран руководителя.
    expect(stats.employees?.[0].rates.averageLateMinutes).toBe(0);
  });
});

describe('доступ к сводке по отделу', () => {
  const twoDepartments = () => {
    const context = setup();
    seedDepartment(context.firestore, 'dep-1', 'Продажи');
    seedDepartment(context.firestore, 'dep-2', 'Поддержка');
    seedUser(context.firestore, 'mop-1', { departmentId: 'dep-1' });
    seedUser(context.firestore, 'mop-2', { departmentId: 'dep-2' });
    return context;
  };

  it('руководитель получает свой отдел', async () => {
    const { service } = twoDepartments();

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.departmentId).toBe('dep-1');
    expect(stats.headcount).toBe(1);
  });

  it('запрошенный чужой отдел подменяется своим', async () => {
    const { service } = twoDepartments();

    // Явный запрос чужого отдела не должен давать чужие цифры.
    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
      'dep-2',
    );

    expect(stats.departmentId).toBe('dep-1');
  });

  it('руководитель без отдела получает отказ', async () => {
    const { service } = twoDepartments();

    await expect(
      service.department(actor('ROP', 'rop-1'), PERIOD.start, PERIOD.end),
    ).rejects.toThrow(/не привязан к отделу/);
  });

  it('директор обязан назвать отдел', async () => {
    const { service } = twoDepartments();

    // Без явного указания непонятно, чей экран показывать.
    await expect(
      service.department(actor('DIRECTOR'), PERIOD.start, PERIOD.end),
    ).rejects.toThrow(/Укажите отдел/);
  });

  it('директор открывает любой отдел', async () => {
    const { service } = twoDepartments();

    const stats = await service.department(
      actor('DIRECTOR'),
      PERIOD.start,
      PERIOD.end,
      'dep-2',
    );

    expect(stats.name).toBe('Поддержка');
  });

  it('отдел чужой организации не открывается', async () => {
    const { firestore, service } = twoDepartments();
    firestore.seed(COLLECTIONS.departments, 'dep-alien', {
      organizationId: 'other-org',
      name: 'Чужой отдел',
      headId: null,
    });

    await expect(
      service.department(actor('DIRECTOR'), PERIOD.start, PERIOD.end, 'dep-alien'),
    ).rejects.toThrow(/Отдел не найден/);
  });
});

describe('выполнение планов в показателях', () => {
  it('усредняет личные планы сотрудника', async () => {
    const { firestore, service } = setup(fakePlans({ user: [0.4, 0.8] }));
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.employees?.[0].planRatio).toBeCloseTo(0.6);
  });

  it('без планов отдаёт null, а не ноль', async () => {
    const { firestore, service } = setup(fakePlans({ user: [] }));
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    // Ноль означал бы «план провален», тогда как плана просто нет.
    expect(stats.employees?.[0].planRatio).toBeNull();
    expect(stats.planRatio).toBeNull();
  });

  it('план отдела считается отдельно от личных', async () => {
    const { firestore, service } = setup(fakePlans({ user: [1], plan: 0.5 }));
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    firestore.seed(COLLECTIONS.plans, 'plan-1', {
      organizationId: ORG,
      scope: 'DEPARTMENT',
      ownerId: 'dep-1',
      metric: 'REVENUE',
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      targetValue: 1_000_000,
    });

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    // Личные планы могут быть выполнены, а общий — нет: это разные цифры.
    expect(stats.planRatio).toBeCloseTo(0.5);
    expect(stats.employees?.[0].planRatio).toBeCloseTo(1);
  });

  it('план чужого отдела не подхватывается', async () => {
    const { firestore, service } = setup(fakePlans({ plan: 0.9 }));
    seedDepartment(firestore, 'dep-1', 'Продажи');
    seedUser(firestore, 'mop-1');
    firestore.seed(COLLECTIONS.plans, 'plan-other', {
      organizationId: ORG,
      scope: 'DEPARTMENT',
      ownerId: 'dep-2',
      metric: 'REVENUE',
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      targetValue: 1_000_000,
    });

    const stats = await service.department(
      actor('ROP', 'rop-1', { departmentId: 'dep-1' }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(stats.planRatio).toBeNull();
  });
});
