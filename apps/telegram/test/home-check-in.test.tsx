import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

const checkIn = vi.fn();
let launchCode: string | null = null;

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>();
  return {
    ...actual,
    api: {
      attendance: vi.fn(async () => []),
      callsSummary: vi.fn(async () => ({ total: 0, answered: 0, rateBps: 0 })),
      unreadCount: vi.fn(async () => ({ count: 0 })),
      checkIn,
      checkOut: vi.fn(),
    },
  };
});

vi.mock('../src/session', () => ({
  useSession: () => ({ user: { fullName: 'Дина Ким', role: 'MOP' } }),
}));

vi.mock('../src/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/telegram')>();
  return {
    ...actual,
    canScanQr: () => true,
    scanQr: vi.fn(async () => 'https://t.me/CorpsolApp?startapp=q2-term1-abcdefghijklmnop'),
    readPosition: vi.fn(async () => ({ lat: 42.9, lng: 71.3, accuracyMeters: 10 })),
    takeLaunchCheckInCode: () => launchCode,
    confirmClosing: () => undefined,
    haptic: () => undefined,
    tap: () => undefined,
  };
});

const { Home } = await import('../src/screens/Home');

beforeEach(() => {
  checkIn.mockReset().mockResolvedValue({ status: 'ON_TIME', lateMinutes: 0, office: { name: 'Офис Тараз' } });
  launchCode = null;
});

afterEach(cleanup);

describe('отметка с главного экрана', () => {
  it('кнопка отправляет на сервер строку из сканера, а не событие нажатия', async () => {
    render(<Home onOpenProfile={() => undefined} />);

    fireEvent.click(await screen.findByText('Отметить приход'));

    await waitFor(() => expect(checkIn).toHaveBeenCalled());
    const body = checkIn.mock.calls[0][0];
    expect(body.qr).toBe('https://t.me/CorpsolApp?startapp=q2-term1-abcdefghijklmnop');
    // Тело должно сериализоваться — на событии нажатия JSON падал.
    expect(() => JSON.stringify(body)).not.toThrow();
    expect(await screen.findByText('Приход отмечен вовремя · Офис Тараз')).toBeTruthy();
  });

  it('открыли камерой по ссылке — отметка идёт сразу, без сканера', async () => {
    launchCode = 'q2-term1-abcdefghijklmnop';
    render(<Home onOpenProfile={() => undefined} />);

    await waitFor(() => expect(checkIn).toHaveBeenCalledWith(expect.objectContaining({ qr: 'q2-term1-abcdefghijklmnop' })));
  });
});
