import { Timestamp } from 'firebase-admin/firestore';

import { PayrollService } from '../src/payroll/payroll.service';
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

  return {
    firestore,
    service: new PayrollService(fakeFirebase(firestore), fakePlans(options.plans)),
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
