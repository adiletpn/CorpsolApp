import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let integrations: unknown[] = [];
let failure: Error | null = null;
let syncResult: unknown = { imported: 0, duplicates: 0, unmatched: [], fetched: 0, rejected: 0, truncated: false };

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (options?.method === 'POST') {
      if (failure) throw failure;
      if (path.endsWith('/sync')) return syncResult;
      return {};
    }
    if (path.includes('integrations')) return integrations;
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

const { Integrations } = await import('../components/screens/Integrations');

const connected = {
  provider: 'BITRIX',
  isActive: true,
  webhookMasked: 'https://portal.bitrix24.kz/rest/1/••••3f7a',
  lastSyncAt: '2026-10-12T09:00:00.000Z',
  lastSyncStatus: 'OK',
  lastSyncError: null,
  syncedUpTo: '2026-10-12T08:30:00.000Z',
};

beforeEach(() => {
  requests.length = 0;
  failure = null;
  integrations = [];
});

describe('подключение Bitrix', () => {
  it('адрес уходит без лишних пробелов по краям', async () => {
    const user = userEvent.setup();
    render(<Integrations />);
    await screen.findByLabelText(/Адрес вебхука/);

    await user.type(
      screen.getByLabelText(/Адрес вебхука/),
      '  https://portal.bitrix24.kz/rest/1/token  ',
    );
    await user.click(screen.getByRole('button', { name: 'Подключить' }));

    await waitFor(() => {
      const call = requests.find((r) => r.path === '/calls/integrations/bitrix');
      const body = call!.options!.body as Record<string, unknown>;
      // Пробел в конце адреса — частая ошибка при копировании из почты.
      expect(body.webhookUrl).toBe('https://portal.bitrix24.kz/rest/1/token');
    });
  });

  it('после подключения поле очищается', async () => {
    const user = userEvent.setup();
    render(<Integrations />);
    const field = await screen.findByLabelText(/Адрес вебхука/);

    await user.type(field, 'https://portal.bitrix24.kz/rest/1/token');
    await user.click(screen.getByRole('button', { name: 'Подключить' }));

    // Токен не должен оставаться на экране после отправки.
    await waitFor(() => expect((field as HTMLInputElement).value).toBe(''));
  });

  it('отказ сервера показывается словами', async () => {
    failure = new Error('Адрес должен выглядеть как адрес портала');

    const user = userEvent.setup();
    render(<Integrations />);
    await screen.findByLabelText(/Адрес вебхука/);

    await user.type(screen.getByLabelText(/Адрес вебхука/), 'не-адрес');
    await user.click(screen.getByRole('button', { name: 'Подключить' }));

    expect(
      await screen.findByText('Адрес должен выглядеть как адрес портала'),
    ).toBeInTheDocument();
  });
});

describe('подключённая интеграция', () => {
  it('показан только замаскированный адрес', async () => {
    integrations = [connected];
    render(<Integrations />);

    await screen.findByText(connected.webhookMasked);

    // Полный адрес — это рабочий доступ к порталу. Если он однажды
    // попадёт в разметку, его увидит любой, кто откроет страницу.
    expect(document.body.textContent).not.toContain('/rest/1/token');
    expect(document.body.innerHTML).not.toMatch(/rest\/1\/[A-Za-z0-9]{6,}/);
  });

  it('синхронизация запускается отдельной кнопкой', async () => {
    integrations = [connected];
    const user = userEvent.setup();
    render(<Integrations />);

    await screen.findByText(connected.webhookMasked);
    await user.click(screen.getByRole('button', { name: /синхронизировать/i }));

    await waitFor(() =>
      expect(
        requests.some((r) => r.path === '/calls/integrations/bitrix/sync'),
      ).toBe(true),
    );
  });
});
