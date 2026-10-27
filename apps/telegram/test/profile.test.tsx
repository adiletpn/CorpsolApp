import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  achievements: vi.fn(),
  notifications: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('../src/api', () => ({ api }));
vi.mock('../src/session', () => ({
  useSession: () => ({
    user: { id: 'mop-1', email: 'demo.mop@corpsol.kz', fullName: 'Демо Менеджер', role: 'MOP' },
    signOut: vi.fn(),
  }),
}));

import { Profile } from '../src/screens/Profile';
import { clearLoadCache } from '../src/useLoad';

const notCounted = {
  id: 'n1',
  kind: 'day_not_counted',
  title: 'День не засчитан',
  body: '26.10 дозвоны 59% (13 из 22) — меньше 75%.',
  createdAt: '2026-10-27T04:00:00.000Z',
  readAt: null,
};

afterEach(cleanup);

beforeEach(() => {
  clearLoadCache();
  api.achievements.mockResolvedValue([]);
  api.notifications.mockResolvedValue([notCounted]);
  api.markAllRead.mockResolvedValue({ marked: 1 });
});

describe('уведомления в профиле', () => {
  it('менеджер видит, почему день не засчитан', async () => {
    render(<Profile />);

    expect(await screen.findByText('День не засчитан')).toBeTruthy();
    // Суть — в цифрах: без них правило выглядит произволом.
    expect(screen.getByText(/13 из 22/)).toBeTruthy();
    expect(screen.getByText('Уведомления · 1')).toBeTruthy();
  });

  it('«Прочитать все» отмечает и обновляет список', async () => {
    render(<Profile />);
    await screen.findByText('День не засчитан');

    api.notifications.mockResolvedValue([{ ...notCounted, readAt: '2026-10-27T05:00:00.000Z' }]);
    fireEvent.click(screen.getByText('Прочитать все'));

    await waitFor(() => expect(screen.getByText('Уведомления')).toBeTruthy());
    expect(api.markAllRead).toHaveBeenCalled();
  });

  it('без уведомлений раздела нет', async () => {
    api.notifications.mockResolvedValue([]);
    render(<Profile />);

    // «Тема» теперь и в строке разделов, и заголовком — ждём заголовок.
    await waitFor(() => expect(document.getElementById('profile-theme')).toBeTruthy());
    expect(screen.queryByText(/Уведомления/)).toBeNull();
  });
});
