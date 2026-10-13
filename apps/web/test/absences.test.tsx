import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let response: unknown = { organizationId: 'org-1', workDate: '', expected: 0, marked: 0 };
let failure: Error | null = null;

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (failure) throw failure;
    return response;
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

const { Absences } = await import('../components/screens/Absences');

beforeEach(() => {
  requests.length = 0;
  failure = null;
  response = { organizationId: 'org-1', workDate: '2026-10-12', expected: 12, marked: 3 };
});

const dateInput = () => screen.getByLabelText('День') as HTMLInputElement;

describe('прогулы: какой день подставлен', () => {
  it('по умолчанию вчерашний — именно за него задача и не отработала', () => {
    render(<Absences />);

    const expected = new Date();
    expected.setDate(expected.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');

    expect(dateInput().value).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    );
  });

  it('выбранный день уходит на сервер, а не сегодняшний', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.clear(dateInput());
    await user.type(dateInput(), '2026-10-05');
    await user.click(screen.getByRole('button', { name: /проставить/i }));

    await waitFor(() => {
      const body = requests[0].options!.body as Record<string, unknown>;
      expect(body.workDate).toBe('2026-10-05');
    });
  });
});

describe('прогулы: что показано после запуска', () => {
  it('видно, сколько должны были выйти и сколько отмечено', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.click(screen.getByRole('button', { name: /проставить/i }));

    expect(await screen.findByText(/Должны были выйти: 12/)).toBeInTheDocument();
    expect(screen.getByText(/Прогулов проставлено: 3/)).toBeInTheDocument();
  });

  it('ноль прогулов объясняется, а не выглядит сбоем', async () => {
    response = { organizationId: 'org-1', workDate: '2026-10-12', expected: 12, marked: 0 };

    const user = userEvent.setup();
    render(<Absences />);
    await user.click(screen.getByRole('button', { name: /проставить/i }));

    // Иначе руководитель решит, что кнопка не сработала, и нажмёт ещё раз.
    expect(await screen.findByText(/Все дни уже закрыты/)).toBeInTheDocument();
  });

  it('при повторном запуске прошлый итог не висит на экране', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.click(screen.getByRole('button', { name: /проставить/i }));
    await screen.findByText(/Прогулов проставлено: 3/);

    failure = new Error('база недоступна');
    await user.click(screen.getByRole('button', { name: /проставить/i }));

    // Старый итог рядом с новой ошибкой читался бы как успех.
    await waitFor(() =>
      expect(screen.queryByText(/Прогулов проставлено: 3/)).not.toBeInTheDocument(),
    );
  });
});

describe('прогулы: сбой', () => {
  it('ошибка показывается словами сервера', async () => {
    failure = new Error('База недоступна');

    const user = userEvent.setup();
    render(<Absences />);
    await user.click(screen.getByRole('button', { name: /проставить/i }));

    expect(await screen.findByText('База недоступна')).toBeInTheDocument();
  });

  it('без выбранного дня кнопка заблокирована', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.clear(dateInput());

    expect(screen.getByRole('button', { name: /проставить/i })).toBeDisabled();
  });
});
