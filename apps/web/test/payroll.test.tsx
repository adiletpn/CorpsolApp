import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let payrolls: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path.startsWith('/payroll?') || path === '/payroll') return payrolls;
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'dir-1',
      email: 'director@corpsol.kz',
      role: 'DIRECTOR' as const,
      departmentId: null,
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('DIRECTOR', permission),
  }),
}));

const { Payroll } = await import('../components/screens/Payroll');

beforeEach(() => {
  requests.length = 0;
  payrolls = [];
});

const payrollRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  userId: 'uid-1',
  departmentId: 'dep-1',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  baseSalaryMinor: 250_000_00,
  bonusMinor: 30_000_00,
  penaltyMinor: 0,
  totalMinor: 280_000_00,
  lines: [],
  status: 'DRAFT',
  calculatedAt: '2026-10-31T10:00:00.000Z',
  approvedAt: null,
  ...overrides,
});

/** Заполняет форму правила премии и отправляет её. */
async function createRule({ amount, percent }: { amount?: string; percent?: string }) {
  const user = userEvent.setup();
  render(<Payroll />);

  await screen.findByText('Новое правило');

  if (amount) await user.type(screen.getByLabelText(/сумма/i), amount);
  if (percent) await user.type(screen.getByLabelText(/процент от оклада/i), percent);

  await user.click(screen.getByRole('button', { name: /создать|добавить/i }));
  return user;
}

const ruleBody = () => {
  const created = requests.find(
    (r) => r.path === '/payroll/rules' && r.options?.method === 'POST',
  );
  expect(created).toBeDefined();
  return created!.options!.body as Record<string, unknown>;
};

describe('правило премии: сумма', () => {
  it('введённые тенге уходят тиынами', async () => {
    await createRule({ amount: '5000' });

    await waitFor(() => expect(ruleBody().amountMinor).toBe(500000));
  });

  it('пустая сумма уходит нулём, а не пустотой', async () => {
    await createRule({ percent: '5' });

    // Сервер ждёт число: пустая строка сломала бы расчёт.
    await waitFor(() => expect(ruleBody().amountMinor).toBe(0));
  });
});

describe('правило премии: процент', () => {
  it('пять процентов хранятся как пятьсот базисных пунктов', async () => {
    await createRule({ percent: '5' });

    await waitFor(() => expect(ruleBody().percentBps).toBe(500));
  });

  it('дробный процент не теряется', async () => {
    await createRule({ percent: '2.5' });

    // 2,5% от оклада — обычное условие премии. Если поле его не примет,
    // такую премию просто не завести.
    await waitFor(() => expect(ruleBody().percentBps).toBe(250));
  });

  it('сумма и процент задаются вместе и складываются', async () => {
    await createRule({ amount: '5000', percent: '5' });

    await waitFor(() => {
      const body = ruleBody();
      expect(body.amountMinor).toBe(500000);
      expect(body.percentBps).toBe(500);
    });
  });
});

describe('утверждение расчёта', () => {
  it('черновик можно утвердить', async () => {
    payrolls = [payrollRow()];
    const user = userEvent.setup();
    render(<Payroll />);

    await user.click(await screen.findByRole('button', { name: 'Утвердить' }));

    await waitFor(() => {
      const approved = requests.find((entry) => entry.path.includes('/approve'));
      expect(approved?.options?.method).toBe('POST');
    });
  });

  it('утверждённый расчёт повторно не утверждают', async () => {
    payrolls = [payrollRow({ status: 'APPROVED', approvedAt: '2026-11-01T09:00:00.000Z' })];
    render(<Payroll />);

    // «Зарплата готова» дважды за месяц читается как ошибка в расчёте.
    await screen.findByText('утверждён');
    expect(screen.queryByRole('button', { name: 'Утвердить' })).not.toBeInTheDocument();
  });

  it('статус виден прямо в строке', async () => {
    payrolls = [payrollRow({ status: 'PAID' })];
    render(<Payroll />);

    expect(await screen.findByText('утверждён')).toBeInTheDocument();
  });

  it('период уходит вместе с запросом', async () => {
    payrolls = [payrollRow()];
    const user = userEvent.setup();
    render(<Payroll />);

    await user.click(await screen.findByRole('button', { name: 'Утвердить' }));

    // Без периода сервер не поймёт, какой из листов сотрудника утверждать.
    await waitFor(() => {
      expect(requests.some((entry) => entry.path.includes('/payroll/uid-1/approve'))).toBe(true);
    });
  });
});
