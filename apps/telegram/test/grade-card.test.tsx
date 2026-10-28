import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import type { GradeProgress } from '../src/api';
import { GradeCard } from '../src/screens/Payroll';

afterEach(cleanup);

const grade = (overrides: Partial<GradeProgress['week']> = {}, next: GradeProgress['next'] = null): GradeProgress => ({
  tier: { code: 'A', name: 'А', baseSalaryMinor: 100_000_00, weekPlan: 6, monthPlan: 25 },
  week: {
    start: '2026-10-26',
    end: '2026-11-01',
    count: 4,
    band: 'under',
    rateMinor: 4_500_00,
    amountMinor: 18_000_00,
    toPlan: 2,
    ...overrides,
  },
  monthCount: 17,
  next,
});

const text = (node: HTMLElement) => (node.textContent ?? '').replace(/\s/g, ' ');

describe('ранг в мини-приложении', () => {
  it('неделя: сколько сделано, ставка и бонус', () => {
    const { container } = render(<GradeCard grade={grade()} />);

    expect(text(container)).toContain('Ранг А');
    expect(text(container)).toContain('4 из 6 рег.');
    expect(text(container)).toContain('ставка · ниже плана');
    expect(text(container)).toContain('18 000 ₸');
    expect(screen.getByText('До плана недели — ещё 2 рег.')).toBeTruthy();
  });

  it('план недели выполнен — так и сказано', () => {
    render(<GradeCard grade={grade({ count: 6, toPlan: 0, band: 'plan' })} />);

    expect(screen.getByText('План недели выполнен')).toBeTruthy();
  });

  it('сколько осталось до следующего ранга', () => {
    render(<GradeCard grade={grade({}, { code: 'B', name: 'Б', monthPlan: 30, left: 13 })} />);

    expect(screen.getByText('До ранга Б — ещё 13 рег. в этом месяце')).toBeTruthy();
    expect(screen.getByText('В месяце 17 из 30')).toBeTruthy();
  });

  it('у старшего ранга строки о следующем нет', () => {
    const { container } = render(<GradeCard grade={grade()} />);

    expect(text(container)).not.toContain('До ранга');
  });
});
