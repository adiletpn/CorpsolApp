import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let pending: unknown[] = [];
let failure: Error | null = null;

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (options?.method === 'POST') {
      if (failure) throw failure;
      // После решения заявка уходит из очереди.
      pending = [];
      return {};
    }
    return pending;
  }),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

const { Devices } = await import('../components/screens/Devices');

const requestFrom = (id: string, fullName: string, model?: string) => ({
  id,
  userId: `uid-${id}`,
  deviceId: `phone-${id}`,
  platform: 'ios',
  model,
  createdAt: '2026-10-12T09:00:00.000Z',
  user: {
    id: `uid-${id}`,
    fullName,
    email: `${id}@corpsol.kz`,
    role: 'MOP' as const,
  },
});

beforeEach(() => {
  requests.length = 0;
  failure = null;
  pending = [requestFrom('req-1', 'Асель Ким', 'iPhone 13')];
});

describe('заявки на смену телефона', () => {
  it('в очереди видно, кто просит и с какого устройства', async () => {
    render(<Devices />);

    expect(await screen.findByText('Асель Ким')).toBeInTheDocument();
    expect(screen.getByText('iPhone 13')).toBeInTheDocument();
  });

  it('неизвестная модель не оставляет пустое место', async () => {
    pending = [requestFrom('req-2', 'Данияр Абенов')];
    render(<Devices />);

    // Пустая ячейка читалась бы как сбой загрузки.
    expect(await screen.findByText('Модель не определена')).toBeInTheDocument();
  });

  it('пустая очередь объясняется словами', async () => {
    pending = [];
    render(<Devices />);

    expect(await screen.findByText('Новых заявок нет')).toBeInTheDocument();
  });
});

describe('решение по заявке', () => {
  it('одобрение уходит на нужный адрес', async () => {
    const user = userEvent.setup();
    render(<Devices />);
    await screen.findByText('Асель Ким');

    await user.click(screen.getByRole('button', { name: 'Одобрить' }));

    await waitFor(() => {
      expect(
        requests.some((r) => r.path === '/devices/requests/req-1/approve'),
      ).toBe(true);
    });
  });

  it('отклонение уходит на свой адрес, а не на одобрение', async () => {
    const user = userEvent.setup();
    render(<Devices />);
    await screen.findByText('Асель Ким');

    await user.click(screen.getByRole('button', { name: 'Отклонить' }));

    await waitFor(() => {
      expect(
        requests.some((r) => r.path === '/devices/requests/req-1/reject'),
      ).toBe(true);
      // Перепутать здесь значит закрепить телефон вместо отказа.
      expect(
        requests.some((r) => r.path.endsWith('/approve')),
      ).toBe(false);
    });
  });

  it('после решения очередь перечитывается', async () => {
    const user = userEvent.setup();
    render(<Devices />);
    await screen.findByText('Асель Ким');

    await user.click(screen.getByRole('button', { name: 'Одобрить' }));

    // Иначе обработанная заявка висит в списке и её одобрят дважды.
    await waitFor(() =>
      expect(screen.getByText('Новых заявок нет')).toBeInTheDocument(),
    );
  });

  it('сбой показывается, а заявка остаётся в очереди', async () => {
    failure = new Error('Заявка уже обработана');

    const user = userEvent.setup();
    render(<Devices />);
    await screen.findByText('Асель Ким');

    await user.click(screen.getByRole('button', { name: 'Одобрить' }));

    expect(await screen.findByText('Заявка уже обработана')).toBeInTheDocument();
    expect(screen.getByText('Асель Ким')).toBeInTheDocument();
  });
});
