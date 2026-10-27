import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import type { Offer } from '../src/api';
import { OfferList } from '../src/screens/Offers';

afterEach(cleanup);

const offer = (id: string, clientName: string, status: Offer['status']): Offer => ({
  id,
  clientName,
  status,
  amountMinor: 100000000,
  sentDate: '2026-10-20',
});

const offers = [
  offer('1', 'ТОО «Алтын Дала»', 'ACCEPTED'),
  offer('2', 'ИП Сериков', 'SENT'),
  offer('3', 'ТОО «Тараз Строй»', 'REJECTED'),
  offer('4', 'ИП Абенов', 'EXPIRED'),
];

describe('фильтр сделок', () => {
  it('«В работе» оставляет только отправленные', () => {
    render(<OfferList offers={offers} />);
    fireEvent.click(screen.getByRole('tab', { name: /В работе/ }));

    expect(screen.getByText('ИП Сериков')).toBeTruthy();
    expect(screen.queryByText('ТОО «Алтын Дала»')).toBeNull();
  });

  it('отказ и истёкший срок — вместе в «Не состоялись»', () => {
    render(<OfferList offers={offers} />);
    fireEvent.click(screen.getByRole('tab', { name: /Не состоялись/ }));

    expect(screen.getByText('ТОО «Тараз Строй»')).toBeTruthy();
    expect(screen.getByText('ИП Абенов')).toBeTruthy();
  });

  it('у чипа число сделок, пустой не нажимается', () => {
    render(<OfferList offers={[offer('1', 'ТОО «Алтын Дала»', 'ACCEPTED')]} />);

    expect(screen.getByRole('tab', { name: /Приняты 1/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('tab', { name: /В работе 0/ })).toHaveProperty('disabled', true);
  });
});
