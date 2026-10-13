import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/departments') return [{ id: 'dep-1', name: 'Продажи' }];
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

const { Plans } = await import('../components/screens/Plans');

beforeEach(() => {
  requests.length = 0;
});

const planBody = () => {
  const created = requests.find(
    (r) => r.path === '/plans' && r.options?.method === 'POST',
  );
  expect(created).toBeDefined();
  return created!.options!.body as Record<string, unknown>;
};

/** Ставит план с выбранной метрикой и целью. */
async function createPlan(metric: string, target: string) {
  const user = userEvent.setup();
  render(<Plans />);

  await screen.findByText('Новый план');

  // Без выбранного отдела кнопка заблокирована — и правильно:
  // план без владельца бессмыслен.
  await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
  await user.selectOptions(screen.getByLabelText(/метрика/i), metric);
  await user.type(screen.getByLabelText(/цель/i), target);
  await user.click(screen.getByRole('button', { name: /поставить|создать/i }));
}

describe('план по выручке', () => {
  it('цель в тенге уходит тиынами', async () => {
    await createPlan('REVENUE', '5000000');

    await waitFor(() => expect(planBody().target).toBe(500000000));
  });

  it('копейки в цели не теряются', async () => {
    await createPlan('REVENUE', '1234.56');

    await waitFor(() => expect(planBody().target).toBe(123456));
  });

  it('подпись поля меняется на денежную', async () => {
    const user = userEvent.setup();
    render(<Plans />);
    await screen.findByText('Новый план');

    await user.selectOptions(screen.getByLabelText(/метрика/i), 'REVENUE');

    // Без «₸» руководитель не поймёт, в чём задавать цель.
    expect(screen.getByLabelText('Цель, ₸')).toBeInTheDocument();
  });
});

describe('план по количеству', () => {
  it('звонки уходят как есть, без умножения на сто', async () => {
    await createPlan('CALLS', '900');

    // Умножение здесь означало бы план в сто раз больше.
    await waitFor(() => expect(planBody().target).toBe(900));
  });

  it('подпись поля без валюты', async () => {
    const user = userEvent.setup();
    render(<Plans />);
    await screen.findByText('Новый план');

    await user.selectOptions(screen.getByLabelText(/метрика/i), 'CALLS');

    expect(screen.getByLabelText('Цель')).toBeInTheDocument();
  });
});
