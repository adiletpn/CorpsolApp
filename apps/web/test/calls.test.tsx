import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

let summary: unknown = { total: 0, answered: 0, talkMinutes: 0 };
let calls: unknown[] = [];
let nextBefore: string | null = null;
const paths: string[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string) => {
    paths.push(path);
    if (path.startsWith('/calls/summary')) return summary;
    if (path.startsWith('/calls')) return { items: calls, nextBefore };
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
  query: (params: Record<string, string | number | boolean | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const result = search.toString();
    return result ? `?${result}` : '';
  },
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
  nextBefore = null;
  paths.length = 0;
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

describe('журнал страницами', () => {
  it('без следующей страницы кнопки нет', async () => {
    calls = [call()];
    render(<Calls />);

    await screen.findByText('+7 707 111 22 33');
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
  });

  it('кнопка появляется, когда журнал показан не целиком', async () => {
    calls = [call()];
    nextBefore = '2026-10-12T09:15:00.000Z';
    render(<Calls />);

    expect(
      await screen.findByRole('button', { name: 'Показать ещё' }),
    ).toBeInTheDocument();
  });

  it('дозагрузка добавляет записи, а не заменяет показанные', async () => {
    calls = [call({ id: 'c1', clientPhone: '77071112233' })];
    nextBefore = '2026-10-12T09:15:00.000Z';
    const user = userEvent.setup();
    render(<Calls />);

    calls = [call({ id: 'c2', clientPhone: '77079998877' })];
    nextBefore = null;
    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }));

    // Пролистав страницу, человек не должен терять предыдущие записи.
    expect(await screen.findByText('+7 707 999 88 77')).toBeInTheDocument();
    expect(screen.getByText('+7 707 111 22 33')).toBeInTheDocument();
  });

  it('курсор уходит на сервер при дозагрузке', async () => {
    calls = [call()];
    nextBefore = '2026-10-12T09:15:00.000Z';
    const user = userEvent.setup();
    render(<Calls />);

    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }));

    // Смещением страницы брать нельзя: импорт сдвинет записи,
    // и часть звонков человек не увидит вовсе.
    await waitFor(() => {
      expect(paths.some((path) => path.includes('before=2026-10-12'))).toBe(true);
    });
  });

  it('сводка считается по всему периоду, а не по странице', async () => {
    summary = { total: 400, answered: 300, talkMinutes: 900 };
    calls = [call()];
    nextBefore = '2026-10-12T09:15:00.000Z';
    render(<Calls />);

    // На экране полсотни строк, но доля дозвонов — по всем четырёмстам.
    expect(await screen.findByText('75%')).toBeInTheDocument();
  });
});
