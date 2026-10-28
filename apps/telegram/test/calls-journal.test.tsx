import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ calls: vi.fn() }));
vi.mock('../src/api', () => ({ api }));

import type { Call } from '../src/api';
import { CallsJournal } from '../src/screens/CallsJournal';

afterEach(cleanup);

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const key = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const call = (id: string, fields: Partial<Call> = {}): Call => ({
  id,
  clientPhone: '+7 701 200 00 00',
  direction: 'OUTBOUND',
  status: 'ANSWERED',
  callDate: key,
  startedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10).toISOString(),
  talkSeconds: 95,
  ...fields,
});

beforeEach(() => {
  // В jsdom прокрутки нет — экран поднимается к началу при смене периода.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  api.calls.mockReset();
  api.calls.mockResolvedValue({
    items: [
      call('a', { clientPhone: '+7 701 555 12 34' }),
      call('b', { direction: 'INBOUND' }),
      call('c', { status: 'NO_ANSWER', talkSeconds: 0 }),
    ],
    nextBefore: null,
  });
});

describe('журнал звонков', () => {
  it('показывает звонки за сегодня под заголовком «Сегодня»', async () => {
    render(<CallsJournal onClose={() => {}} />);

    expect(await screen.findByText('+7 701 555 12 34')).toBeTruthy();
    // «Сегодня» есть и в чипе периода — проверяем именно заголовок дня.
    const dayLabels = [...document.querySelectorAll('.section-label span:first-child')].map((node) => node.textContent);
    expect(dayLabels).toContain('Сегодня');
  });

  it('чип вида звонка оставляет только нужные', async () => {
    render(<CallsJournal onClose={() => {}} />);
    await screen.findByText('+7 701 555 12 34');

    fireEvent.click(screen.getByRole('tab', { name: /Без ответа/ }));

    expect(screen.queryByText('+7 701 555 12 34')).toBeNull();
    expect(screen.getByText('Нет ответа')).toBeTruthy();
  });

  it('поиск по цифрам номера', async () => {
    render(<CallsJournal onClose={() => {}} />);
    await screen.findByText('+7 701 555 12 34');

    fireEvent.change(screen.getByPlaceholderText(/Номер или время/), { target: { value: '5551234' } });

    expect(screen.getByText('1 звонок · с ответом 100%')).toBeTruthy();
  });

  it('«Показать ещё» берёт следующую страницу по курсору', async () => {
    api.calls
      .mockResolvedValueOnce({ items: [call('a')], nextBefore: 'cursor-1' })
      .mockResolvedValueOnce({ items: [call('z', { clientPhone: '+7 777 000 00 01' })], nextBefore: null });
    render(<CallsJournal onClose={() => {}} />);

    fireEvent.click(await screen.findByText('Показать ещё'));

    expect(await screen.findByText('+7 777 000 00 01')).toBeTruthy();
    expect(api.calls).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 'cursor-1');
  });

  it('после сбоя «Повторить» правда загружает снова', async () => {
    api.calls.mockRejectedValueOnce(new Error('Нет связи с интернетом.'));
    render(<CallsJournal onClose={() => {}} />);

    fireEvent.click(await screen.findByText('Повторить'));

    await waitFor(() => expect(api.calls).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('+7 701 555 12 34')).toBeTruthy();
  });

  it('стрелка назад закрывает журнал', async () => {
    const onClose = vi.fn();
    render(<CallsJournal onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Назад к «Работе»'));

    expect(onClose).toHaveBeenCalled();
  });
});
