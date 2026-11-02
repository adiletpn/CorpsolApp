import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

const paths: string[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string) => {
    paths.push(path);
    if (path.startsWith('/payroll?') || path === '/payroll') {
      return [
        {
          id: 'pay-1', userId: 'mop-1', departmentId: 'dep-1', periodStart: '2026-10-01', periodEnd: '2026-10-31',
          baseSalaryMinor: 120_000_00, bonusMinor: 0, penaltyMinor: 0, totalMinor: 120_000_00, lines: [],
          status: 'DRAFT', calculatedAt: '2026-10-31T10:00:00.000Z', approvedAt: null,
        },
      ];
    }
    if (path === '/employees') {
      return [{ id: 'mop-1', fullName: 'Дина', role: 'MOP', status: 'ACTIVE', gradeCode: 'A' }];
    }
    return [];
  }),
  query: vi.fn(() => ''),
  download: vi.fn(),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: { id: 'rop-1', email: 'anara@corpsol.kz', role: 'ROP' as const, departmentId: 'dep-1', officeId: null, permissions: [] },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('ROP', permission),
  }),
}));

const { Payroll } = await import('../components/screens/Payroll');

describe('зарплата глазами РОП', () => {
  it('видит расчёты отдела, но не меняет ранги, правила и суммы', async () => {
    render(<Payroll />);

    expect(await screen.findByText('Дина')).toBeTruthy();
    expect(screen.queryByText('Ранги')).toBeNull();
    expect(screen.queryByText('Правила премирования')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Утвердить' })).toBeNull();
    // Служебные списки, доступные только директору, даже не запрашиваются.
    expect(paths.some((path) => path.startsWith('/payroll/rules') || path.startsWith('/payroll/adjustments'))).toBe(false);
  });
});
