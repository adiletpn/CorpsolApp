import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const paths: string[] = [];
let events: unknown[] = [];

vi.mock('../lib/api', () => ({
  request: vi.fn(async (path: string) => {
    paths.push(path);
    return events;
  }),
  // Строку запроса собираем по-настоящему: проверка фильтра
  // держится именно на ней.
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

const { Audit } = await import('../components/screens/Audit');

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'ev-1',
  action: 'employee.create',
  actor: { id: 'uid-1', fullName: 'Данияр Абенов' },
  targetType: 'user',
  targetId: 'uid-2',
  metadata: { role: 'MOP' },
  createdAt: '2026-10-05T10:00:00.000Z',
  ...overrides,
});

const row = (text: string) => screen.getByText(text).closest('tr')!;

beforeEach(() => {
  paths.length = 0;
  events = [];
});

describe('обходы автоматического контроля', () => {
  it('правка табеля выделена как обход', async () => {
    events = [
      event({
        action: 'attendance.adjust',
        metadata: { workDate: '2026-10-02', status: 'PRESENT', reason: 'сбой QR' },
      }),
    ];
    render(<Audit />);

    // Руководитель может поставить явку задним числом — ради этого
    // журнал и существует, поэтому такие строки видно сразу.
    const badge = await screen.findByText('Правка табеля');
    expect(badge.tagName).toBe('SPAN');
  });

  it('обычное действие не выделяют', async () => {
    events = [event()];
    render(<Audit />);

    expect((await screen.findByText('Заведён сотрудник')).tagName).toBe('TD');
  });

  it('фильтр просит у сервера только обходы', async () => {
    const user = userEvent.setup();
    render(<Audit />);

    await user.click(await screen.findByLabelText('Только обходы контроля'));

    // Фильтровать на клиенте нельзя: сервер отдаёт лишь последние 200 событий,
    // и редкое открепление телефона просто не попало бы в выборку.
    await waitFor(() => {
      expect(paths.some((path) => path.includes('sensitiveOnly=true'))).toBe(true);
    });
  });

  it('пустой журнал объясняется по-разному с фильтром и без', async () => {
    const user = userEvent.setup();
    render(<Audit />);

    expect(await screen.findByText('Журнал пуст')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Только обходы контроля'));
    expect(await screen.findByText('Обходов контроля не было')).toBeInTheDocument();
  });
});

describe('подробности события', () => {
  it('правка табеля показывает дату, новый статус и причину', async () => {
    events = [
      event({
        action: 'attendance.adjust',
        metadata: {
          workDate: '2026-10-02',
          status: 'PRESENT',
          previousStatus: 'ABSENT',
          reason: 'сбой QR',
        },
      }),
    ];
    render(<Audit />);

    expect(
      await screen.findByText('за 2026-10-02: PRESENT (было ABSENT) — сбой QR'),
    ).toBeInTheDocument();
  });

  it('первая отметка за день не выдумывает прежний статус', async () => {
    events = [
      event({
        action: 'attendance.adjust',
        metadata: { workDate: '2026-10-02', status: 'PRESENT', reason: 'сбой QR' },
      }),
    ];
    render(<Audit />);

    expect(await screen.findByText('за 2026-10-02: PRESENT — сбой QR')).toBeInTheDocument();
  });

  it('идентификатор телефона обрезан до узнаваемого начала', async () => {
    events = [
      event({
        action: 'device.unbind',
        metadata: { deviceId: 'ABCDEFGH-1234-5678-9012-ABCDEFGHIJKL' },
      }),
    ];
    render(<Audit />);

    expect(await screen.findByText('устройство ABCDEFGH-123…')).toBeInTheDocument();
  });

  it('увольнение без причины названо прямо', async () => {
    events = [event({ action: 'employee.terminate', metadata: {} })];
    render(<Audit />);

    expect(await screen.findByText('без указания причины')).toBeInTheDocument();
  });

  it('незнакомое действие показано кодом, а не пропадает', async () => {
    events = [event({ action: 'payroll.recalculated', metadata: { periodId: '2026-10' } })];
    render(<Audit />);

    // Журнал не должен молча прятать событие только потому,
    // что для него не завели подпись.
    expect(await screen.findByText('payroll.recalculated')).toBeInTheDocument();
    expect(screen.getByText('periodId: "2026-10"')).toBeInTheDocument();
  });

  it('удалённый автор не ломает строку', async () => {
    events = [event({ actor: null })];
    render(<Audit />);

    await screen.findByText('Заведён сотрудник');
    expect(within(row('Заведён сотрудник')).getByText('—')).toBeInTheDocument();
  });
});
