import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

let summary: unknown = { total: 0, answered: 0, talkMinutes: 0 };
let calls: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string) => {
    if (path.startsWith('/calls/summary')) return summary;
    if (path.startsWith('/calls')) return calls;
    if (path === '/employees') {
      return [
        {
          id: 'uid-1',
          email: 'asel@corpsol.kz',
          fullName: 'Асель Ким',
          role: 'MOP',
          status: 'ACTIVE',
          departmentId: null,
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
      id: 'rop-1',
      email: 'rop@corpsol.kz',
      role: 'ROP' as const,
      departmentId: 'dep-1',
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('ROP', permission),
  }),
}));

const { Calls } = await import('../components/screens/Calls');

const call = (overrides: Record<string, unknown> = {}) => ({
  id: 'call-1',
  userId: 'uid-1',
  source: 'KCELL',
  direction: 'OUTBOUND',
  status: 'ANSWERED',
  clientPhone: '77071112233',
  callDate: '2026-10-12',
  startedAt: '2026-10-12T09:15:00.000Z',
  durationSeconds: 107,
  talkSeconds: 95,
  recordingUrl: null,
  ...overrides,
});

beforeEach(() => {
  summary = { total: 0, answered: 0, talkMinutes: 0 };
  calls = [];
});

describe('сводка по звонкам', () => {
  it('доля дозвонов считается от всех набранных номеров', async () => {
    summary = { total: 80, answered: 60, talkMinutes: 143 };
    render(<Calls />);

    // Руководитель смотрит именно долю: сто звонков с десятью ответами
    // это не работа, а гудки.
    expect(await screen.findByText('75%')).toBeInTheDocument();
  });

  it('без звонков доля показана прочерком, а не нулём', async () => {
    render(<Calls />);

    // Ноль процентов читался бы как «звонили и не дозвонились».
    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('доля округляется до целых', async () => {
    summary = { total: 3, answered: 2, talkMinutes: 5 };
    render(<Calls />);

    expect(await screen.findByText('67%')).toBeInTheDocument();
  });
});

describe('журнал звонков', () => {
  it('номер клиента показан читаемо, а не слитно', async () => {
    calls = [call()];
    render(<Calls />);

    // В таблице номер сверяют глазами с заявкой.
    expect(await screen.findByText('+7 707 111 22 33')).toBeInTheDocument();
  });

  it('длительность показана минутами и секундами', async () => {
    calls = [call({ talkSeconds: 95 })];
    render(<Calls />);

    expect(await screen.findByText('1 мин 35 с')).toBeInTheDocument();
  });

  it('несостоявшийся звонок без длительности', async () => {
    calls = [call({ status: 'NO_ANSWER', talkSeconds: 0 })];
    render(<Calls />);

    expect(await screen.findAllByText('—')).not.toHaveLength(0);
  });

  it('звонок уволенного сотрудника не теряет строку', async () => {
    calls = [call({ userId: 'uid-404' })];
    render(<Calls />);

    // Иначе в журнале появится пустая ячейка без объяснения.
    expect(await screen.findByText('Сотрудник удалён')).toBeInTheDocument();
  });

  it('пустой период объясняется словами', async () => {
    render(<Calls />);

    expect(
      await screen.findByText('За выбранный период звонков нет'),
    ).toBeInTheDocument();
  });
});
