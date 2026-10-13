import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/departments') return [{ id: 'dep-1', name: 'Продажи' }];
    if (path === '/employees') {
      return [
        {
          id: 'uid-1',
          email: 'asel@corpsol.kz',
          fullName: 'Асель Ким',
          role: 'MOP',
          status: 'ACTIVE',
          departmentId: 'dep-1',
          officeId: null,
          baseSalaryMinor: 0,
        },
      ];
    }
    return [];
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'admin-1',
      email: 'admin@corpsol.kz',
      role: 'SUPER_ADMIN' as const,
      departmentId: null,
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('SUPER_ADMIN', permission),
  }),
}));

const { Schedules } = await import('../components/screens/Schedules');

beforeEach(() => {
  requests.length = 0;
});

const created = () => {
  const call = requests.find(
    (r) => r.path === '/schedules' && r.options?.method === 'POST',
  );
  expect(call).toBeDefined();
  return call!.options!.body as Record<string, unknown>;
};

async function openForm() {
  const user = userEvent.setup();
  render(<Schedules />);
  await screen.findByText('Новый график');
  return user;
}

describe('график: кому принадлежит', () => {
  it('график отдела уходит без сотрудника', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => {
      const body = created();
      expect(body.departmentId).toBe('dep-1');
      // График принадлежит либо отделу, либо сотруднику, но не обоим:
      // иначе непонятно, какой из них применять.
      expect(body.userId).toBeUndefined();
    });
  });

  it('личный график уходит без отдела', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Кому'), 'USER');
    await user.selectOptions(screen.getByLabelText(/Сотрудник/), 'uid-1');
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => {
      const body = created();
      expect(body.userId).toBe('uid-1');
      expect(body.departmentId).toBeUndefined();
    });
  });
});

describe('график: рабочие дни', () => {
  it('по умолчанию будни', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => expect(created().workdays).toEqual([1, 2, 3, 4, 5]));
  });

  it('выходной добавляется нажатием', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
    await user.click(screen.getByRole('button', { name: 'Сб' }));
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => expect(created().workdays).toContain(6));
  });

  it('будний день снимается повторным нажатием', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
    await user.click(screen.getByRole('button', { name: 'Пт' }));
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => expect(created().workdays).not.toContain(5));
  });

  it('график без единого дня создать нельзя', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');

    // Снимаем все будни. Кнопки берём по порядку, а не по подписи:
    // список дней задаётся в одном месте и может поменяться.
    const days = screen
      .getAllByRole('button')
      .filter((button) => /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)$/.test(button.textContent ?? ''));

    for (const day of days) {
      if (day.textContent === 'Сб' || day.textContent === 'Вс') continue;
      await user.click(day);
    }

    // Иначе по такому графику сотрудник не обязан выходить никогда,
    // и ночная задача не поймёт, кого считать прогульщиком.
    expect(
      screen.getByRole('button', { name: /добавить график/i }),
    ).toBeDisabled();
  });
});

describe('график: допуск на опоздание', () => {
  it('уходит числом, а не строкой', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByLabelText('Отдел'), 'dep-1');
    await user.click(screen.getByRole('button', { name: /добавить график/i }));

    await waitFor(() => {
      // Строка вместо числа сломала бы сравнение на стороне сервера.
      expect(typeof created().graceMinutes).toBe('number');
    });
  });
});
