import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import { PayrollCard } from '../src/screens/Payroll';

afterEach(cleanup);

const sheet = {
  id: 'p1',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  baseSalaryMinor: 30000000,
  bonusMinor: 6500000,
  penaltyMinor: 1000000,
  totalMinor: 35500000,
  status: 'APPROVED' as const,
  lines: [],
};

describe('разбивка зарплаты', () => {
  it('порядок: бонусы, оклад, удержания', () => {
    const { container } = render(<PayrollCard sheet={sheet} />);

    // Синий оклад разделяет зелёный и красный: при дейтеранопии
    // они неразличимы, если стоят рядом (проверено валидатором палитры).
    const labels = [...container.querySelectorAll('.stacked-label')].map((node) => node.textContent);
    expect(labels).toEqual(['Бонусы', 'Оклад', 'Удержания']);
  });

  it('удержания заштрихованы — признак кроме цвета', () => {
    const { container } = render(<PayrollCard sheet={sheet} />);

    const segments = container.querySelectorAll('.stacked-segment');
    expect(segments[segments.length - 1].className).toContain('is-striped');
  });

  it('удержание в легенде — с минусом', () => {
    render(<PayrollCard sheet={sheet} />);

    // Между разрядами русская локаль ставит неразрывный пробел — \s его ловит.
    expect(screen.getByText(/^-10\s000 ₸$/)).toBeTruthy();
  });
});
