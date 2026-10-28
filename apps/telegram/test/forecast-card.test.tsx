import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import { ForecastCard } from '../src/screens/Payroll';

afterEach(cleanup);

const forecast = (overrides = {}) => ({
  periodStart: '2026-10-01',
  asOf: '2026-10-28',
  baseSalaryMinor: 100_000_00,
  bonusMinor: 0,
  penaltyMinor: 0,
  totalMinor: 100_000_00,
  ...overrides,
});

const text = (node: HTMLElement) => (node.textContent ?? '').replace(/\s/g, ' ');

describe('прогноз зарплаты', () => {
  it('сумма на сегодня и честная подпись, что это не утверждено', () => {
    const { container } = render(<ForecastCard forecast={forecast({ bonusMinor: 18_000_00, totalMinor: 118_000_00 })} />);

    expect(text(container)).toContain('Прогноз на 28 октября');
    expect(text(container)).toContain('118 000 ₸');
    expect(text(container)).toContain('бонусы +18 000 ₸');
    expect(text(container)).toContain('Не утверждено');
  });

  it('нулевые бонусы и удержания не перечисляются', () => {
    const { container } = render(<ForecastCard forecast={forecast()} />);

    expect(text(container)).not.toContain('бонусы');
    expect(text(container)).not.toContain('удержания');
  });
});
