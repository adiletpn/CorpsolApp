import { Timestamp } from 'firebase-admin/firestore';

import { GradesService } from '../src/payroll/grades.service';
import { PayrollService, monthEnd } from '../src/payroll/payroll.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { COLLECTIONS, payrollDocId } from '../src/firestore/collections';
import type { PlansService } from '../src/plans/plans.service';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const USER = 'u1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
const SALARY = 25_000_000;

const director = {
  id: 'director',
  organizationId: ORG,
  email: 'director@corpsol.kz',
  role: 'DIRECTOR',
  departmentId: null,
  officeId: null,
  deviceId: null,
} as AuthenticatedUser;

/** Планы подменяем: их измерение проверяется отдельным набором тестов. */
const fakePlans = (progress: unknown[] = []) =>
  ({ progressForUser: jest.fn(async () => progress) }) as unknown as PlansService;

function setup(options: { plans?: unknown[] } = {}) {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.users, USER, {
    organizationId: ORG,
    fullName: 'Менеджер 1',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    baseSalaryMinor: SALARY,
    currency: 'KZT',
  });

  const firebase = fakeFirebase(firestore);
  const notifications = new NotificationsService(firebase);

  return {
    firestore,
    notifications,
    service: new PayrollService(firebase, fakePlans(options.plans), notifications, new GradesService(firebase)),
  };
}

function seedDay(
  firestore: FakeFirestore,
  day: string,
  status: string,
  lateMinutes = 0,
) {
  firestore.seed(COLLECTIONS.attendance, `${USER}_2026-09-${day}`, {
    userId: USER,
    organizationId: ORG,
    departmentId: 'dep-1',
    workDate: `2026-09-${day}`,
    status,
    lateMinutes,
  });
}

function seedRule(firestore: FakeFirestore, id: string, fields: Record<string, unknown>) {
  firestore.seed(COLLECTIONS.bonusRules, id, {
    organizationId: ORG,
    departmentId: null,
    kind: 'LATE_PENALTY',
    metric: null,
    threshold: 0,
    amountMinor: 0,
    percentBps: 0,
    isActive: true,
    createdAt: Timestamp.now(),
    ...fields,
  });
}

describe('сводка табеля для расчёта', () => {
  it('не наказывает за выходные и уважительные причины', async () => {
    const { firestore, service } = setup();

    seedDay(firestore, '01', 'ON_TIME');
    seedDay(firestore, '02', 'DAY_OFF');
    seedDay(firestore, '03', 'EXCUSED');

    seedRule(firestore, 'penalty', {
      kind: 'ABSENCE_PENALTY',
      amountMinor: 1_000_000,
    });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    // Иначе человек терял бы деньги за собственный выходной.
    expect(result.penaltyMinor).toBe(0);
    expect(result.totalMinor).toBe(SALARY);
  });

  it('считает опоздания и прогулы отдельно', async () => {
    const { firestore, service } = setup();

    seedDay(firestore, '01', 'LATE', 20);
    seedDay(firestore, '02', 'LATE', 10);
    seedDay(firestore, '03', 'ABSENT');

    seedRule(firestore, 'late', { kind: 'LATE_PENALTY', threshold: 0, amountMinor: 100_000 });
    seedRule(firestore, 'absence', { kind: 'ABSENCE_PENALTY', amountMinor: 500_000 });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    // Два опоздания по 1000 ₸ плюс один прогул за 5000 ₸.
    expect(result.penaltyMinor).toBe(700_000);
  });

  it('не засчитанный по дозвонам день штрафуется как прогул', async () => {
    const { firestore, service } = setup();

    seedDay(firestore, '01', 'NOT_COUNTED');
    seedRule(firestore, 'absence', { kind: 'ABSENCE_PENALTY', amountMinor: 500_000 });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    // Пришёл, но не дозванивался — день не отработан.
    expect(result.penaltyMinor).toBe(500_000);
  });

  it('не берёт дни за пределами периода', async () => {
    const { firestore, service } = setup();

    seedDay(firestore, '15', 'LATE', 30);
    firestore.seed(COLLECTIONS.attendance, `${USER}_2026-08-15`, {
      userId: USER,
      workDate: '2026-08-15',
      status: 'LATE',
      lateMinutes: 30,
    });

    seedRule(firestore, 'late', { kind: 'LATE_PENALTY', threshold: 0, amountMinor: 100_000 });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(result.penaltyMinor).toBe(100_000);
  });
});

describe('отбор правил премирования', () => {
  it('применяет правила компании ко всем', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');

    seedRule(firestore, 'company', {
      kind: 'ATTENDANCE',
      departmentId: null,
      threshold: 0,
      amountMinor: 500_000,
    });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(result.bonusMinor).toBe(500_000);
  });

  it('правило чужого отдела не применяется', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');

    seedRule(firestore, 'other-department', {
      kind: 'ATTENDANCE',
      departmentId: 'dep-2',
      threshold: 0,
      amountMinor: 500_000,
    });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(result.bonusMinor).toBe(0);
  });

  it('правило отдела дополняет общее, а не заменяет', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');

    seedRule(firestore, 'company', {
      kind: 'ATTENDANCE',
      departmentId: null,
      threshold: 0,
      amountMinor: 300_000,
    });
    seedRule(firestore, 'department', {
      kind: 'ATTENDANCE',
      departmentId: 'dep-1',
      threshold: 0,
      amountMinor: 200_000,
    });

    // Иначе одно правило отдела молча отключало бы всю систему премирования.
    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(result.bonusMinor).toBe(500_000);
  });

  it('отключённое правило не применяется', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');

    seedRule(firestore, 'disabled', {
      kind: 'ATTENDANCE',
      threshold: 0,
      amountMinor: 500_000,
      isActive: false,
    });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(result.bonusMinor).toBe(0);
  });
});

describe('сохранение расчёта', () => {
  it('пересчёт перезаписывает лист, а не создаёт второй', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');

    await service.calculate(director, USER, PERIOD.start, PERIOD.end);
    await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    // Двух разных сумм за один месяц у сотрудника быть не может.
    expect(firestore.all(COLLECTIONS.payrolls)).toHaveLength(1);
    expect(firestore.read(COLLECTIONS.payrolls, payrollDocId(USER, PERIOD.start))).toBeDefined();
  });

  it('сохраняет построчную расшифровку', async () => {
    const { firestore, service } = setup();
    seedDay(firestore, '01', 'ON_TIME');
    seedRule(firestore, 'bonus', { kind: 'ATTENDANCE', threshold: 0, amountMinor: 500_000 });

    const result = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    // Без расшифровки премия воспринимается как произвол.
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].amountMinor).toBe(500_000);
  });

  it('не считает зарплату сотруднику чужой организации', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'stranger', {
      organizationId: 'other-org',
      fullName: 'Чужой',
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: null,
      baseSalaryMinor: 99_000_000,
    });

    await expect(
      service.calculate(director, 'stranger', PERIOD.start, PERIOD.end),
    ).rejects.toThrow();
  });
});

describe('утверждение расчёта', () => {
  const calculated = async () => {
    const context = setup();
    await context.service.calculate(director, USER, PERIOD.start, PERIOD.end);
    return context;
  };

  it('черновик становится утверждённым', async () => {
    const { service } = await calculated();

    const result = await service.approve(director, USER, PERIOD.start);

    expect(result.status).toBe('APPROVED');
    expect(result.approvedBy).toBe('director');
  });

  it('сотрудник узнаёт о начислении', async () => {
    const { service, notifications } = await calculated();

    await service.approve(director, USER, PERIOD.start);

    const [item] = await notifications.list(USER);
    expect(item?.title).toBe('Расчёт за месяц готов');
  });

  it('в сообщении сумма в тенге, а не в тиынах', async () => {
    const { service, notifications } = await calculated();

    await service.approve(director, USER, PERIOD.start);

    const [item] = await notifications.list(USER);
    expect(item?.body).toContain('₸');
    expect(item?.body).not.toMatch(/\d{7,}/);
  });

  it('черновик сотруднику не показывают', async () => {
    const { service, notifications } = await calculated();

    // Пока лист черновик, суммы ещё изменятся пересчётом.
    expect(await notifications.list(USER)).toHaveLength(0);
    await service.approve(director, USER, PERIOD.start);
  });

  it('повторное утверждение не шлёт второе сообщение', async () => {
    const { service, notifications } = await calculated();

    await service.approve(director, USER, PERIOD.start);
    await service.approve(director, USER, PERIOD.start);

    // «Зарплата готова» дважды за месяц читается как ошибка в расчёте.
    expect(await notifications.list(USER)).toHaveLength(1);
  });

  it('повторное утверждение не сдвигает дату', async () => {
    const { service } = await calculated();

    const first = await service.approve(director, USER, PERIOD.start);
    const second = await service.approve(director, USER, PERIOD.start);

    expect(second.approvedAt).toBe(first.approvedAt);
  });

  it('несуществующий расчёт утвердить нельзя', async () => {
    const { service } = setup();

    await expect(service.approve(director, USER, PERIOD.start)).rejects.toThrow();
  });

  it('чужая организация расчёт не утвердит', async () => {
    const { service } = await calculated();

    const foreign = { ...director, organizationId: 'org-999' } as typeof director;

    // Ответ тот же, что и для несуществующего: подтверждать чужому,
    // что расчёт существует, незачем.
    await expect(service.approve(foreign, USER, PERIOD.start)).rejects.toThrow();
  });
});

describe('расчёт по рангу', () => {
  const OCTOBER = { start: '2026-10-01', end: '2026-10-31' };

  const seedOffer = (firestore: FakeFirestore, id: string, sentDate: string, status = 'ACCEPTED') =>
    firestore.seed(COLLECTIONS.offers, id, {
      userId: USER,
      organizationId: ORG,
      departmentId: 'dep-1',
      clientName: 'Клиент',
      amountMinor: 0,
      status,
      sentDate,
    });

  it('оклад — из ранга, а не из карточки', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, USER, { ...firestore.read(COLLECTIONS.users, USER), gradeCode: 'B' });

    const result = await service.calculate(director, USER, OCTOBER.start, OCTOBER.end);

    expect(result.baseSalaryMinor).toBe(120_000_00);
  });

  it('за каждую неделю — строка бонуса с объяснением ставки', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, USER, { ...firestore.read(COLLECTIONS.users, USER), gradeCode: 'A' });
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].forEach((date, index) =>
      seedOffer(firestore, `o${index}`, date),
    );
    // Отклонённая регистрация в план не идёт.
    seedOffer(firestore, 'rejected', '2026-10-10', 'REJECTED');

    const result = await service.calculate(director, USER, OCTOBER.start, OCTOBER.end);

    // Между разрядами суммы — неразрывный пробел русской локали.
    const lines = result.lines.map((line) => ({ ...line, title: line.title.replace(/\s/g, ' ') }));
    expect(lines).toEqual([
      {
        ruleId: 'week-2026-10-05',
        kind: 'WEEKLY_OFFERS',
        title: 'Неделя 05.10–11.10 · 6 рег., план · 6 × 5 000 ₸',
        amountMinor: 30_000_00,
      },
    ]);
    expect(result.totalMinor).toBe(100_000_00 + 30_000_00);
  });

  it('без ранга — по-старому: оклад из карточки, без недельных бонусов', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1', '2026-10-05');

    const result = await service.calculate(director, USER, OCTOBER.start, OCTOBER.end);

    expect(result.baseSalaryMinor).toBe(SALARY);
    expect(result.lines).toEqual([]);
  });
});

describe('ручные правки директора', () => {
  it('доплата попадает в лист строкой с причиной, сумма пересчитана сразу', async () => {
    const { service } = setup();

    const sheet = await service.addAdjustment(director, USER, PERIOD.start, 2_000_000, '  Наставничество  ');

    expect(sheet.totalMinor).toBe(SALARY + 2_000_000);
    expect(sheet.lines).toContainEqual(
      expect.objectContaining({ kind: 'MANUAL', title: 'Наставничество', amountMinor: 2_000_000 }),
    );
  });

  it('удержание вычитается и остаётся при следующем пересчёте', async () => {
    const { service } = setup();
    await service.addAdjustment(director, USER, PERIOD.start, -1_000_000, 'Порча гарнитуры');

    const recalculated = await service.calculate(director, USER, PERIOD.start, PERIOD.end);

    expect(recalculated.penaltyMinor).toBe(1_000_000);
    expect(recalculated.totalMinor).toBe(SALARY - 1_000_000);
  });

  it('снятая правка уходит из суммы', async () => {
    const { service } = setup();
    await service.addAdjustment(director, USER, PERIOD.start, 2_000_000, 'Ошибочно');
    const [adjustment] = await service.listAdjustments(director, PERIOD.start);

    const sheet = await service.removeAdjustment(director, adjustment.id);

    expect(sheet.totalMinor).toBe(SALARY);
    expect(await service.listAdjustments(director, PERIOD.start)).toEqual([]);
  });

  it('в утверждённый лист правку не внести', async () => {
    const { service } = setup();
    await service.calculate(director, USER, PERIOD.start, PERIOD.end);
    await service.approve(director, USER, PERIOD.start);

    await expect(service.addAdjustment(director, USER, PERIOD.start, 100_000, 'Поздно')).rejects.toThrow(/утверждён/);
  });

  it('правка пишется в журнал с автором, суммой и причиной', async () => {
    const { firestore, service } = setup();

    await service.addAdjustment(director, USER, PERIOD.start, -500_000, 'Опоздание на планёрку');

    const [event] = firestore.all(COLLECTIONS.auditEvents);
    expect(event).toMatchObject({
      action: 'payroll.adjust',
      actorId: 'director',
      metadata: { userId: USER, amountMinor: -500_000, reason: 'Опоздание на планёрку' },
    });
  });

  it('сотрудника чужой организации не правим', async () => {
    const { service } = setup();

    await expect(
      service.addAdjustment({ ...director, organizationId: 'org-2' }, USER, PERIOD.start, 100_000, 'x'),
    ).rejects.toThrow(/не найден/);
  });

  it('конец месяца для периода — с учётом високосного февраля', () => {
    expect(monthEnd('2026-09-01')).toBe('2026-09-30');
    expect(monthEnd('2028-02-01')).toBe('2028-02-29');
  });
});
