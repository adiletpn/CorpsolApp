import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GRADE_TIERS } from '@corpsol/shared';

const requests: Array<{ path: string; options?: Record<string, unknown> }> = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string, options?: Record<string, unknown>) => {
    requests.push({ path, options });
    if (path === '/payroll/grades') return (options?.body as { tiers?: unknown })?.tiers ?? DEFAULT_GRADE_TIERS;
    return {};
  }),
}));

import { Grades } from '../components/Grades';
import type { Employee } from '../lib/types';

const employee = (overrides: Partial<Employee>): Employee => ({
  id: 'mop-1',
  email: 'dina@corpsol.kz',
  fullName: 'Дина',
  role: 'MOP',
  status: 'ACTIVE',
  departmentId: null,
  officeId: null,
  phone: null,
  baseSalaryMinor: 0,
  gradeCode: 'A',
  hiredAt: '2026-01-01T00:00:00.000Z',
  terminatedAt: null,
  ...overrides,
});

const normalize = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

beforeEach(() => {
  requests.length = 0;
});

describe('ранги в панели', () => {
  it('таблица «Новая система»: оклад и ставки в тенге', async () => {
    render(<Grades employees={[]} onChanged={vi.fn()} />);

    const row = (await screen.findByText('Б')).closest('tr')!;
    expect(normalize(row.textContent)).toContain('120 000 ₸');
    expect(normalize(row.textContent)).toContain('8 500 ₸');
  });

  it('правка таблицы уходит в тиынах', async () => {
    const user = userEvent.setup();
    render(<Grades employees={[]} onChanged={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Изменить таблицу' }));
    const rate = screen.getByLabelText('А: В план');
    await user.clear(rate);
    await user.type(rate, '5200');
    await user.click(screen.getByRole('button', { name: 'Сохранить таблицу' }));

    await waitFor(() => expect(requests.some((r) => r.options?.method === 'PUT')).toBe(true));
    const sent = requests.find((r) => r.options?.method === 'PUT')!.options!.body as { tiers: typeof DEFAULT_GRADE_TIERS };
    expect(sent.tiers[0].ratePlanMinor).toBe(5_200_00);
    expect(sent.tiers[1]).toEqual(DEFAULT_GRADE_TIERS[1]);
  });

  it('перевод менеджера на ранг', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<Grades employees={[employee({})]} onChanged={onChanged} />);

    await screen.findByText('Б');
    await user.selectOptions(screen.getByLabelText('Ранг: Дина'), 'C');

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(requests).toContainEqual({
      path: '/payroll/grades/assign',
      options: { method: 'POST', body: { userId: 'mop-1', code: 'C' } },
    });
  });

  it('без ранга менеджер помечен старой схемой; РОП и уволенные в списке не показаны', async () => {
    render(
      <Grades
        employees={[
          employee({ id: 'new', fullName: 'Ярослав', gradeCode: null }),
          employee({ id: 'rop', fullName: 'Руководитель', role: 'ROP' }),
          employee({ id: 'gone', fullName: 'Ушедший', status: 'TERMINATED' }),
        ]}
        onChanged={vi.fn()}
      />,
    );

    await screen.findByText('Ярослав');
    expect(screen.getByText('старая схема')).toBeTruthy();
    expect(screen.queryByText('Руководитель')).toBeNull();
    expect(screen.queryByText('Ушедший')).toBeNull();
  });
});
