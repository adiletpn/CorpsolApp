import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let createResponse: Record<string, unknown> = {};

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/employees' && options?.method === 'POST') return createResponse;
    // Какие роли ЧР вправе выдавать: без этого ответа форма заведения
    // не показывается вовсе.
    if (path === '/employees/assignable-roles') return { roles: ['MOP', 'ROP'] };
    return [];
  }),
  query: vi.fn(async () => []),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'hr-1',
      email: 'hr@corpsol.kz',
      role: 'HR' as const,
      departmentId: null,
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('HR', permission),
  }),
}));

const { Employees } = await import('../components/screens/Employees');

beforeEach(() => {
  requests.length = 0;
  createResponse = {
    id: 'uid-1',
    email: 'new@corpsol.kz',
    fullName: 'Асель Ким',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: null,
    officeId: null,
    baseSalaryMinor: 30000000,
    temporaryPassword: 'Xk7-mQ2-pLv',
  };
});

/** Отправка формы заведения сотрудника. */
async function createEmployee(salary?: string) {
  const user = userEvent.setup();
  render(<Employees />);

  await screen.findByText('Новый сотрудник');

  await user.type(screen.getByLabelText(/email/i), 'new@corpsol.kz');
  await user.type(screen.getByLabelText(/имя/i), 'Асель Ким');
  if (salary) await user.type(screen.getByLabelText(/оклад/i), salary);

  await user.click(screen.getByRole('button', { name: /завести/i }));

  return user;
}

describe('заведение сотрудника: оклад', () => {
  it('введённые тенге уходят на сервер тиынами', async () => {
    await createEmployee('300000');

    await waitFor(() => {
      const created = requests.find((r) => r.options?.method === 'POST');
      expect(created).toBeDefined();
      const body = created!.options!.body as Record<string, unknown>;
      // Оклад вводится в тенге, хранится в тиынах. Ошибка здесь
      // означала бы зарплату в сто раз больше или меньше.
      expect(body.baseSalaryMinor).toBe(30000000);
    });
  });

  it('пустой оклад не превращается в ноль', async () => {
    await createEmployee();

    await waitFor(() => {
      const created = requests.find((r) => r.options?.method === 'POST');
      const body = created!.options!.body as Record<string, unknown>;
      // Ноль означал бы «работает бесплатно», а не «оклад не задан».
      expect(body.baseSalaryMinor).toBeUndefined();
    });
  });

  it('копейки доходят до сервера целыми тиынами', async () => {
    await createEmployee('1234.56');

    await waitFor(() => {
      const created = requests.find((r) => r.options?.method === 'POST');
      expect(created).toBeDefined();
      const body = created!.options!.body as Record<string, unknown>;
      expect(body.baseSalaryMinor).toBe(123456);
      // Дробный тиын в базе сломал бы расчёт зарплаты.
      expect(Number.isInteger(body.baseSalaryMinor)).toBe(true);
    });
  });

  it('значение мельче тиына поле не принимает', async () => {
    const user = userEvent.setup();
    render(<Employees />);
    await screen.findByText('Новый сотрудник');

    const salary = screen.getByLabelText(/оклад/i) as HTMLInputElement;
    await user.type(salary, '1234.567');

    // Доли тиына не бывает: шаг поля не даёт отправить такое значение.
    expect(salary.checkValidity()).toBe(false);
  });
});

describe('заведение сотрудника: временный пароль', () => {
  it('пароль показывается после заведения', async () => {
    await createEmployee('300000');

    expect(await screen.findByText('Xk7-mQ2-pLv')).toBeInTheDocument();
  });

  it('рядом сказано, что пароль виден один раз', async () => {
    await createEmployee('300000');

    await screen.findByText('Xk7-mQ2-pLv');
    // Иначе ЧР закроет страницу и сотрудник останется без доступа.
    expect(screen.getByText(/один раз/i)).toBeInTheDocument();
  });

  it('пароль можно скрыть с экрана', async () => {
    const user = await createEmployee('300000');

    await screen.findByText('Xk7-mQ2-pLv');
    await user.click(screen.getByRole('button', { name: /скрыть/i }));

    expect(screen.queryByText('Xk7-mQ2-pLv')).not.toBeInTheDocument();
  });
});
