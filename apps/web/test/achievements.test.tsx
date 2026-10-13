import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let items: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async () => items),
  query: vi.fn(() => ''),
  ApiError: class extends Error {},
}));

const { Achievements } = await import('../components/screens/Achievements');

const achievement = (overrides: Record<string, unknown> = {}) => ({
  code: 'FIRST_DEAL',
  title: 'Первая сделка',
  description: 'Клиент согласился',
  points: 50,
  unlockedAt: null,
  ...overrides,
});

beforeEach(() => {
  items = [];
});

describe('разделение достижений', () => {
  it('полученные и цели разложены по разным спискам', async () => {
    items = [
      achievement({ code: 'A', title: 'Полученное', unlockedAt: '2026-10-05T10:00:00.000Z' }),
      achievement({ code: 'B', title: 'Будущее' }),
    ];
    render(<Achievements />);

    const earned = (await screen.findByText('Получено')).closest('section')!;
    const goals = screen.getByText('К чему стремиться').closest('section')!;

    expect(within(earned).getByText('Полученное')).toBeInTheDocument();
    expect(within(earned).queryByText('Будущее')).not.toBeInTheDocument();
    expect(within(goals).getByText('Будущее')).toBeInTheDocument();
  });

  it('счётчик показывает прогресс, а не только число наград', async () => {
    items = [
      achievement({ code: 'A', unlockedAt: '2026-10-05T10:00:00.000Z' }),
      achievement({ code: 'B' }),
      achievement({ code: 'C' }),
    ];
    render(<Achievements />);

    // «1» без «из 3» не говорит, много это или мало.
    expect(await screen.findByText('1 из 3')).toBeInTheDocument();
  });
});

describe('карточка достижения', () => {
  it('дата получения показана без времени', async () => {
    items = [achievement({ unlockedAt: '2026-10-05T10:00:00.000Z' })];
    render(<Achievements />);

    // Час получения ачивки никому не интересен — в карточке только дата.
    expect(await screen.findByText('Получено 5 октября 2026 г.')).toBeInTheDocument();
  });

  it('очки показаны со знаком начисления', async () => {
    items = [achievement({ unlockedAt: '2026-10-05T10:00:00.000Z', points: 50 })];
    render(<Achievements />);

    expect(await screen.findByText('+50 очков')).toBeInTheDocument();
  });

  it('у цели тоже видно, сколько она даст', async () => {
    items = [achievement({ points: 120 })];
    render(<Achievements />);

    expect(await screen.findByText('+120 очков')).toBeInTheDocument();
  });

  it('условие достижения описано словами', async () => {
    items = [achievement()];
    render(<Achievements />);

    expect(await screen.findByText('Клиент согласился')).toBeInTheDocument();
  });
});

describe('пустые состояния', () => {
  it('до загрузки не обещают пустой список', () => {
    render(<Achievements />);

    expect(screen.getAllByText('Загружаем…')).toHaveLength(2);
  });

  it('новичка подбадривают, а не показывают пустоту', async () => {
    items = [achievement()];
    render(<Achievements />);

    expect(await screen.findByText('Пока ни одного — всё впереди')).toBeInTheDocument();
  });

  it('собравшему всё не показывают пустой список целей', async () => {
    items = [achievement({ unlockedAt: '2026-10-05T10:00:00.000Z' })];
    render(<Achievements />);

    expect(await screen.findByText('Все достижения получены')).toBeInTheDocument();
  });
});
