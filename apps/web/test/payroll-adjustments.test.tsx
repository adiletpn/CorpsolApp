import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    return {};
  }),
}));

import { PayrollAdjustments } from '../components/PayrollAdjustments';

beforeEach(() => {
  requests.length = 0;
});

const renderForm = (adjustments = [] as Parameters<typeof PayrollAdjustments>[0]['adjustments']) => {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<PayrollAdjustments userId="u1" periodStart="2026-10-01" adjustments={adjustments} onChanged={onChanged} />);
  return { onChanged, user: userEvent.setup() };
};

describe('ручные правки зарплаты в панели', () => {
  it('удержание уходит со знаком минус и в тиынах', async () => {
    const { user, onChanged } = renderForm();

    await user.selectOptions(screen.getByLabelText('Доплата или удержание'), '-');
    await user.type(screen.getByLabelText('Сумма, ₸'), '5 000');
    await user.type(screen.getByLabelText('Причина'), '  Порча гарнитуры ');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(requests).toContainEqual({
      path: '/payroll/adjustments',
      options: {
        method: 'POST',
        body: { userId: 'u1', periodStart: '2026-10-01', amountMinor: -500_000, reason: 'Порча гарнитуры' },
      },
    });
  });

  it('сумма-мусор не уходит на сервер', async () => {
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Сумма, ₸'), 'abc');
    await user.type(screen.getByLabelText('Причина'), 'x');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText('Сумма — положительное число в тенге')).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it('правку можно снять', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, onChanged } = renderForm([
      { id: 'adj-1', userId: 'u1', periodStart: '2026-10-01', amountMinor: 2_000_000, reason: 'Наставничество' },
    ]);

    expect(screen.getByText(/Наставничество/).textContent?.replace(/\s/g, ' ')).toContain('+20 000 ₸');
    await user.click(screen.getByRole('button', { name: 'Снять' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(requests).toContainEqual({ path: '/payroll/adjustments/adj-1', options: { method: 'DELETE' } });
  });
});
