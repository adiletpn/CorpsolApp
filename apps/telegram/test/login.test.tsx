import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  signIn: vi.fn<(email: string, password: string) => Promise<void>>(),
  blocked: null as string | null,
};

vi.mock('../src/session', () => ({
  useSession: () => session,
  signInErrorText: () => 'Неверный логин или пароль.',
}));

import { Login } from '../src/screens/Login';

function fill() {
  fireEvent.change(screen.getByLabelText('Рабочая почта'), { target: { value: 'demo.mop@corpsol.kz' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Corpsol000' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Войти' }));
}

// Без globals у vitest библиотека не убирает разметку сама.
afterEach(cleanup);

beforeEach(() => {
  session.signIn.mockReset();
  session.blocked = null;
});

describe('вход', () => {
  it('кнопка ждёт, пока сервер открывает сессию', async () => {
    session.signIn.mockResolvedValue();
    render(<Login />);

    await act(async () => fill());

    // Пароль принят, но экран ещё не сменился: кнопка не гаснет на полпути.
    expect(screen.getByRole('button', { name: /Входим/ })).toHaveProperty('disabled', true);
  });

  it('неверный пароль — сообщение и кнопка снова доступна', async () => {
    session.signIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    render(<Login />);

    await act(async () => fill());

    expect(screen.getByText('Неверный логин или пароль.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Войти' })).toHaveProperty('disabled', false);
  });

  it('отказ сервера снимает ожидание', async () => {
    session.signIn.mockResolvedValue();
    const view = render(<Login />);
    await act(async () => fill());

    session.blocked = 'Аккаунт закреплён за другим Telegram.';
    view.rerender(<Login />);

    expect(screen.getByText('Аккаунт закреплён за другим Telegram.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Войти' })).toHaveProperty('disabled', false);
  });
});
