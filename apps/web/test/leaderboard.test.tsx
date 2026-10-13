import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can } from '@corpsol/shared';

let result: unknown = null;

vi.mock('../lib/api', () => ({
  request: vi.fn(async () => result),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({
    session: {
      id: 'uid-2',
      email: 'asel@corpsol.kz',
      role: 'MOP' as const,
      departmentId: 'dep-1',
      officeId: null,
      permissions: [],
    },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: (permission: Parameters<typeof can>[1]) => can('MOP', permission),
  }),
}));

const { Leaderboard } = await import('../components/screens/Leaderboard');

const entry = (overrides: Record<string, unknown> = {}) => ({
  userId: 'uid-1',
  fullName: 'Данияр Абенов',
  points: 120,
  rank: 1,
  pointsBehindLeader: 0,
  ...overrides,
});

const board = (entries: unknown[]) => ({
  departmentId: 'dep-1',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  entries,
  self: null,
});

const row = (name: string) => screen.getByText(name, { exact: false }).closest('tr')!;

beforeEach(() => {
  result = board([]);
});

describe('места в рейтинге', () => {
  it('первая тройка отмечена медалями', async () => {
    result = board([
      entry({ userId: 'u1', fullName: 'Первый', rank: 1, pointsBehindLeader: 0 }),
      entry({ userId: 'u3', fullName: 'Второй', rank: 2, pointsBehindLeader: 10 }),
      entry({ userId: 'u4', fullName: 'Третий', rank: 3, pointsBehindLeader: 20 }),
    ]);
    render(<Leaderboard />);

    expect(await screen.findByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
  });

  it('с четвёртого места показан номер', async () => {
    result = board([entry({ rank: 4, pointsBehindLeader: 30 })]);
    render(<Leaderboard />);

    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('лидер отмечен вместо отрыва', async () => {
    result = board([entry()]);
    render(<Leaderboard />);

    // «−0 до первого» у самого первого выглядело бы ошибкой.
    expect(await screen.findByText('лидер')).toBeInTheDocument();
  });

  it('остальным показан отрыв от первого', async () => {
    result = board([entry({ rank: 2, pointsBehindLeader: 35 })]);
    render(<Leaderboard />);

    expect(await screen.findByText('−35 до первого')).toBeInTheDocument();
  });

  it('своя строка подписана', async () => {
    result = board([
      entry({ userId: 'uid-1', fullName: 'Данияр Абенов', rank: 1 }),
      entry({ userId: 'uid-2', fullName: 'Асель Ким', rank: 2, pointsBehindLeader: 15 }),
    ]);
    render(<Leaderboard />);

    // Смысл рейтинга в том, чтобы сотрудник нашёл в нём себя.
    expect(await screen.findByText('— это вы')).toBeInTheDocument();
    expect(within(row('Асель Ким')).getByText('— это вы')).toBeInTheDocument();
  });
});

describe('расшифровка очков', () => {
  it('причины начисления названы по-человечески', async () => {
    result = board([
      entry({ breakdown: { CHECK_IN_ON_TIME: 40, OFFER_ACCEPTED: 80 } }),
    ]);
    render(<Leaderboard />);

    expect(
      await screen.findByText('Приход вовремя: 40 · Принятые сделки: 80'),
    ).toBeInTheDocument();
  });

  it('нулевые причины не засоряют строку', async () => {
    result = board([
      entry({ breakdown: { CHECK_IN_ON_TIME: 40, LATE_PENALTY: 0, CALL_QUOTA: 0 } }),
    ]);
    render(<Leaderboard />);

    expect(await screen.findByText('Приход вовремя: 40')).toBeInTheDocument();
  });

  it('штраф показан со знаком', async () => {
    result = board([entry({ breakdown: { LATE_PENALTY: -15 } })]);
    render(<Leaderboard />);

    expect(await screen.findByText('Опоздания: -15')).toBeInTheDocument();
  });

  it('незнакомая причина показана кодом, а не пропадает', async () => {
    result = board([entry({ breakdown: { NEW_RULE: 5 } })]);
    render(<Leaderboard />);

    // Лучше непонятный код, чем молча потерянные очки.
    expect(await screen.findByText('NEW_RULE: 5')).toBeInTheDocument();
  });

  it('без расшифровки стоит прочерк', async () => {
    result = board([entry()]);
    render(<Leaderboard />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});

describe('пустые состояния', () => {
  it('до ответа сервера показано ожидание', () => {
    result = null;
    render(<Leaderboard />);

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });

  it('период без начислений объяснён словами', async () => {
    render(<Leaderboard />);

    expect(
      await screen.findByText('Очки за этот период ещё не начислялись'),
    ).toBeInTheDocument();
  });
});
