import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Role, can } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];
let role: Role = 'ROP';
let offers: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path.startsWith('/offers?') || path === '/offers') return offers;
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
      id: 'uid-9',
      email: 'rop@corpsol.kz',
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

const { Offers } = await import('../components/screens/Offers');

const offer = (overrides: Record<string, unknown> = {}) => ({
  id: 'offer-1',
  userId: 'uid-1',
  clientName: 'ТОО «Алатау»',
  clientPhone: null,
  amountMinor: 1_000_000,
  status: 'SENT',
  sentDate: '2026-10-05',
  sentAt: '2026-10-05T07:00:00.000Z',
  ...overrides,
});

const row = (clientName: string) => screen.getByText(clientName).closest('tr')!;

beforeEach(() => {
  requests.length = 0;
  role = 'ROP';
  offers = [];
});

describe('подтверждение сделок', () => {
  it('автор сделки не может подтвердить её сам', async () => {
    role = 'MOP';
    offers = [offer()];
    render(<Offers />);

    // Принятая сделка закрывает план и поднимает премию: право
    // подтверждения намеренно отделено от права заводить сделки.
    await screen.findByText('ТОО «Алатау»');
    expect(screen.queryByRole('button', { name: 'Принята' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отказ' })).not.toBeInTheDocument();
  });

  it('руководитель отмечает сделку принятой', async () => {
    offers = [offer()];
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(await screen.findByRole('button', { name: 'Принята' }));

    await waitFor(() => {
      const resolved = requests.find((item) => item.path === '/offers/offer-1/resolve');
      expect(resolved?.options?.body).toEqual({ status: 'ACCEPTED' });
    });
  });

  it('отказ отправляется отдельным статусом', async () => {
    offers = [offer()];
    const user = userEvent.setup();
    render(<Offers />);

    await user.click(await screen.findByRole('button', { name: 'Отказ' }));

    await waitFor(() => {
      const resolved = requests.find((item) => item.path === '/offers/offer-1/resolve');
      expect(resolved?.options?.body).toEqual({ status: 'REJECTED' });
    });
  });

  it('решённую сделку нельзя переподтвердить', async () => {
    offers = [offer({ status: 'ACCEPTED' })];
    render(<Offers />);

    // Иначе выручка и премия пересчитались бы задним числом.
    await screen.findByText('Принята');
    expect(screen.queryByRole('button', { name: 'Отказ' })).not.toBeInTheDocument();
  });
});

describe('итоги месяца', () => {
  it('выручку даёт только принятая сделка', async () => {
    offers = [
      offer({ id: 'o-1', clientName: 'Принятая', status: 'ACCEPTED', amountMinor: 500_000 }),
      offer({ id: 'o-2', clientName: 'Висит', status: 'SENT', amountMinor: 900_000 }),
      offer({ id: 'o-3', clientName: 'Отказ', status: 'REJECTED', amountMinor: 900_000 }),
      offer({ id: 'o-4', clientName: 'Истекла', status: 'EXPIRED', amountMinor: 900_000 }),
    ];
    render(<Offers />);

    // Отправленная сделка — ещё не деньги: в выручку идут только 5 000 ₸.
    const revenue = (await screen.findByText('Выручка')).previousElementSibling;
    expect(revenue).toHaveTextContent(/^5\s?000\s₸$/);
  });

  it('в ожидании считаются только неотвеченные', async () => {
    offers = [
      offer({ id: 'o-1', clientName: 'Висит-1', status: 'SENT' }),
      offer({ id: 'o-2', clientName: 'Висит-2', status: 'SENT' }),
      offer({ id: 'o-3', clientName: 'Истекла', status: 'EXPIRED' }),
    ];
    render(<Offers />);

    const pending = (await screen.findByText('Ждут решения')).previousElementSibling;
    expect(pending).toHaveTextContent('2');
  });
});

describe('список сделок', () => {
  it('телефон клиента показан, когда он есть', async () => {
    offers = [offer({ clientPhone: '+7 707 111 22 33' })];
    render(<Offers />);

    expect(await screen.findByText('+7 707 111 22 33')).toBeInTheDocument();
  });

  it('сделка уволенного сотрудника не теряет строку', async () => {
    offers = [offer({ userId: 'uid-404' })];
    render(<Offers />);

    await screen.findByText('ТОО «Алатау»');
    expect(within(row('ТОО «Алатау»')).getByText('Сотрудник')).toBeInTheDocument();
  });

  it('пустой месяц объясняется словами', async () => {
    render(<Offers />);

    expect(await screen.findByText('Сделок пока нет')).toBeInTheDocument();
  });
});
