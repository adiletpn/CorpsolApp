import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
const downloads: Array<{ path: string; fallbackName: string }> = [];
let downloadFailure: Error | null = null;
let response: unknown = { organizationId: 'org-1', workDate: '', expected: 0, marked: 0 };
let failure: Error | null = null;

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (failure) throw failure;
    return response;
  }),
  query: (params: Record<string, string | number | boolean | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const result = search.toString();
    return result ? `?${result}` : '';
  },
  download: vi.fn(async (path: string, fallbackName: string) => {
    downloads.push({ path, fallbackName });
    if (downloadFailure) throw downloadFailure;
  }),
  ApiError: class extends Error {},
}));

const { Absences } = await import('../components/screens/Absences');

beforeEach(() => {
  requests.length = 0;
  downloads.length = 0;
  failure = null;
  downloadFailure = null;
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

describe('табель для бухгалтерии', () => {
  it('по умолчанию выгружается текущий месяц целиком', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.click(screen.getByRole('button', { name: 'Выгрузить табель' }));

    // Бухгалтеру нужен месяц, а не день, за который догоняли прогулы.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;

    expect(downloads[0]?.path).toContain(`from=${first}`);
  });

  it('период выгрузки не зависит от дня простановки прогулов', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.clear(dateInput());
    await user.type(dateInput(), '2026-03-04');
    await user.click(screen.getByRole('button', { name: 'Выгрузить табель' }));

    // Это разные задачи на одном экране, и путать их периоды нельзя.
    expect(downloads[0]?.path).not.toContain('2026-03-04');
  });

  it('выбранный период уходит в запрос', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    const [fromInput, toInput] = [
      screen.getByLabelText('С') as HTMLInputElement,
      screen.getByLabelText('По') as HTMLInputElement,
    ];
    await user.clear(fromInput);
    await user.type(fromInput, '2026-09-01');
    await user.clear(toInput);
    await user.type(toInput, '2026-09-30');

    await user.click(screen.getByRole('button', { name: 'Выгрузить табель' }));

    expect(downloads[0]?.path).toContain('from=2026-09-01');
    expect(downloads[0]?.path).toContain('to=2026-09-30');
  });

  it('имя файла содержит период, а не просто «отчёт»', async () => {
    const user = userEvent.setup();
    render(<Absences />);

    await user.click(screen.getByRole('button', { name: 'Выгрузить табель' }));

    // В папке бухгалтера за год лежит дюжина таких файлов.
    expect(downloads[0]?.fallbackName).toMatch(/^tabel_\d{4}-\d{2}-\d{2}_/);
  });

  it('сбой выгрузки объясняется, а не проходит молча', async () => {
    downloadFailure = new Error('Нет доступа к отчёту');
    const user = userEvent.setup();
    render(<Absences />);

    await user.click(screen.getByRole('button', { name: 'Выгрузить табель' }));

    expect(await screen.findByText('Нет доступа к отчёту')).toBeInTheDocument();
  });
});
