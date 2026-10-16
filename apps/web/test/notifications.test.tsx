import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths: Array<{ path: string; method?: string }> = [];
let unread = 0;
let items: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    paths.push({ path, method: options?.method as string | undefined });
    if (path === '/notifications/unread-count') return { count: unread };
    if (path === '/notifications/read-all') return { marked: unread };
    if (path === '/notifications') return items;
    return null;
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

const { Notifications } = await import('../components/Notifications');

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'device_rebind_requested',
  title: 'Заявка на смену телефона',
  body: 'Асель Ким просит закрепить iPhone 13',
  refType: 'DeviceRequest',
  refId: 'req-1',
  createdAt: new Date().toISOString(),
  readAt: null,
  ...overrides,
});

beforeEach(() => {
  paths.length = 0;
  unread = 0;
  items = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('счётчик непрочитанных', () => {
  it('без непрочитанных кружок не рисуется', async () => {
    render(<Notifications />);

    await waitFor(() => expect(paths.length).toBeGreaterThan(0));
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('число показывается на кнопке', async () => {
    unread = 3;
    render(<Notifications />);

    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('больше девяти сокращается', async () => {
    unread = 42;
    render(<Notifications />);

    // Точное число не меняет решения, а в кружок оно не помещается.
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('счётчик обновляется сам, без перезагрузки страницы', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    unread = 0;
    render(<Notifications />);

    await waitFor(() => expect(paths.length).toBe(1));
    unread = 2;
    await vi.advanceTimersByTimeAsync(60_000);

    // Заявка блокирует человеку вход: узнать о ней через час — поздно.
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });
});

describe('лента', () => {
  it('список грузится при открытии, а не заранее', async () => {
    items = [item()];
    const user = userEvent.setup();
    render(<Notifications />);

    await waitFor(() => expect(paths.length).toBeGreaterThan(0));
    expect(paths.some((entry) => entry.path === '/notifications')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));
    expect(await screen.findByText('Асель Ким просит закрепить iPhone 13')).toBeInTheDocument();
  });

  it('пустая лента объясняется словами', async () => {
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));

    expect(await screen.findByText('Пока ничего нет')).toBeInTheDocument();
  });

  it('требующее действия отмечено точкой', async () => {
    items = [item()];
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));

    expect(await screen.findByLabelText('Требует действия')).toBeInTheDocument();
  });

  it('прочитанное действия уже не требует', async () => {
    items = [item({ readAt: new Date().toISOString() })];
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));

    await screen.findByText('Заявка на смену телефона');
    expect(screen.queryByLabelText('Требует действия')).not.toBeInTheDocument();
  });

  it('к сведению точкой не отмечается', async () => {
    items = [item({ kind: 'payroll_ready', title: 'Расчёт за месяц готов' })];
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));

    // Иначе отметка перестаёт значить «нужно что-то сделать».
    await screen.findByText('Расчёт за месяц готов');
    expect(screen.queryByLabelText('Требует действия')).not.toBeInTheDocument();
  });
});

describe('прочитать всё', () => {
  it('кнопки нет, когда всё прочитано', async () => {
    items = [item({ readAt: new Date().toISOString() })];
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(screen.getByRole('button', { name: 'Уведомления' }));

    await screen.findByText('Заявка на смену телефона');
    expect(screen.queryByText('Прочитать всё')).not.toBeInTheDocument();
  });

  it('счётчик гаснет сразу, не дожидаясь следующего опроса', async () => {
    unread = 2;
    items = [item()];
    const user = userEvent.setup();
    render(<Notifications />);

    await user.click(await screen.findByRole('button', { name: /Уведомления/ }));
    await user.click(await screen.findByText('Прочитать всё'));

    await waitFor(() => expect(screen.queryByText('2')).not.toBeInTheDocument());
  });
});
