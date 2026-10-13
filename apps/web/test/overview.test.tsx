import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Role, can } from '@corpsol/shared';

const paths: string[] = [];
let role: Role = 'DIRECTOR';
let company: unknown = null;
let department: unknown = null;

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string) => {
    paths.push(path);
    if (path.startsWith('/analytics/company')) return company;
    if (path.startsWith('/analytics/department')) return department;
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'uid-1',
      email: 'boss@corpsol.kz',
      role,
      departmentId: 'dep-1',
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can(role, permission),
  }),
}));

const { Overview } = await import('../components/screens/Overview');

const rates = (overrides: Record<string, number> = {}) => ({
  presentDays: 18,
  expectedDays: 20,
  attendanceRate: 0.9,
  punctualityRate: 0.75,
  averageLateMinutes: 4,
  ...overrides,
});

const departmentStats = (overrides: Record<string, unknown> = {}) => ({
  departmentId: 'dep-1',
  name: 'Продажи',
  headcount: 6,
  rates: rates(),
  planRatio: 0.82,
  acceptedOffers: 14,
  revenueMinor: 4_500_000,
  risks: [],
  ...overrides,
});

beforeEach(() => {
  paths.length = 0;
  role = 'DIRECTOR';
  company = {
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    headcount: 12,
    rates: rates(),
    acceptedOffers: 31,
    revenueMinor: 9_900_000,
    departments: [],
  };
  department = departmentStats();
});

describe('сводка по правам', () => {
  it('директор видит компанию целиком', async () => {
    render(<Overview />);

    expect(await screen.findByText('Сводка по компании')).toBeInTheDocument();
    expect(paths.some((path) => path.startsWith('/analytics/company'))).toBe(true);
  });

  it('руководитель отдела не запрашивает сводку по компании', async () => {
    role = 'ROP';
    render(<Overview />);

    // РОПу чужие отделы видеть незачем — экран даже не стучится
    // в общий отчёт, а не просто прячет его после загрузки.
    expect(await screen.findByText('Отдел: Продажи')).toBeInTheDocument();
    expect(paths.some((path) => path.startsWith('/analytics/company'))).toBe(false);
  });
});

describe('показатели периода', () => {
  it('доли показаны процентами, а не долями единицы', async () => {
    render(<Overview />);

    expect(await screen.findByText('90%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('выручка показана в тенге, а не в тиынах', async () => {
    render(<Overview />);

    // 9 900 000 тиын — это 99 000 ₸, и ошибка здесь в сто раз.
    expect(await screen.findByText(/99\s?000\s₸/)).toBeInTheDocument();
  });

  it('до загрузки показано ожидание, а не пустые нули', async () => {
    company = null;
    render(<Overview />);

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });
});

describe('таблица отделов', () => {
  it('отдел без плана не показывает процент выполнения', async () => {
    company = { ...(company as object), departments: [departmentStats({ planRatio: null })] };
    render(<Overview />);

    // Ноль процентов читался бы как «план провален»,
    // хотя плана просто нет.
    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('отдел без замечаний отмечен отдельно', async () => {
    company = { ...(company as object), departments: [departmentStats()] };
    render(<Overview />);

    expect(await screen.findByText('Без замечаний')).toBeInTheDocument();
  });

  it('замечания по отделу показаны списком', async () => {
    company = {
      ...(company as object),
      departments: [
        departmentStats({
          risks: [
            { code: 'FREQUENT_LATE', severity: 'warning', message: 'Частые опоздания' },
            { code: 'PLAN_BEHIND', severity: 'critical', message: 'План горит' },
          ],
        }),
      ],
    };
    render(<Overview />);

    expect(await screen.findByText('Частые опоздания')).toBeInTheDocument();
    expect(screen.getByText('План горит')).toBeInTheDocument();
  });

  it('пустая компания объясняется словами', async () => {
    render(<Overview />);

    expect(await screen.findByText('Отделы ещё не заведены')).toBeInTheDocument();
  });
});

describe('таблица сотрудников отдела', () => {
  it('выходы показаны как «вышел из ожидаемых»', async () => {
    role = 'ROP';
    department = departmentStats({
      employees: [
        {
          userId: 'uid-2',
          fullName: 'Асель Ким',
          rates: rates({ presentDays: 17, expectedDays: 20 }),
          planRatio: 1.2,
          acceptedOffers: 5,
          revenueMinor: 100_000,
          risks: [],
        },
      ],
    });
    render(<Overview />);

    expect(await screen.findByText('17 из 20')).toBeInTheDocument();
  });

  it('перевыполнение плана показано как есть', async () => {
    role = 'ROP';
    department = departmentStats({
      employees: [
        {
          userId: 'uid-2',
          fullName: 'Асель Ким',
          rates: rates(),
          planRatio: 1.2,
          acceptedOffers: 5,
          revenueMinor: 100_000,
          risks: [],
        },
      ],
    });
    render(<Overview />);

    // Срезать до сотни нельзя: премия считается именно от перевыполнения.
    expect(await screen.findByText('120%')).toBeInTheDocument();
  });

  it('пустой отдел объясняется словами', async () => {
    role = 'ROP';
    department = departmentStats({ employees: [] });
    render(<Overview />);

    expect(await screen.findByText('В отделе пока никого нет')).toBeInTheDocument();
  });
});
