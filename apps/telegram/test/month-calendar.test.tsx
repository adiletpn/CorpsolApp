import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AttendanceRecord } from '../src/api';
import { MonthCalendar } from '../src/MonthCalendar';

afterEach(cleanup);

const day = (workDate: string, fields: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: workDate,
  workDate,
  checkInAt: `${workDate}T03:52:00.000Z`,
  checkOutAt: `${workDate}T13:04:00.000Z`,
  status: 'ON_TIME',
  lateMinutes: 0,
  method: 'QR',
  ...fields,
});

const OCTOBER = new Date(2026, 9, 1);
const records = [
  day('2026-10-21'),
  day('2026-10-22', { status: 'LATE', lateMinutes: 12 }),
  day('2026-10-23', { status: 'ABSENT', checkInAt: null, checkOutAt: null, method: 'AUTO_ABSENCE' }),
  day('2026-10-26', { status: 'NOT_COUNTED' }),
];

function renderOctober() {
  return render(<MonthCalendar records={records} month={OCTOBER} today="2026-10-27" />);
}

const cell = (date: string) => screen.getByRole('button', { name: new RegExp(`^${date}`) });

describe('табель календарём', () => {
  it('месяц начинается с нужного дня недели', () => {
    const { container } = renderOctober();

    // 1 октября 2026 — четверг: перед ним три пустые клетки (пн, вт, ср).
    const grid = container.querySelector('.calendar-grid')!;
    const firstDay = [...grid.children].findIndex((node) => node.textContent === '1');
    expect(firstDay - 7).toBe(3);
  });

  it('день окрашен по статусу', () => {
    renderOctober();

    expect(cell('21 октября').className).toContain('is-success');
    expect(cell('22 октября').className).toContain('is-warning');
    // Прогул и «не засчитан» в расчёте одно — и цветом одно.
    expect(cell('23 октября').className).toContain('is-danger');
    expect(cell('26 октября').className).toContain('is-danger');
  });

  it('будущие дни нельзя выбрать', () => {
    renderOctober();

    expect(cell('28 октября')).toHaveProperty('disabled', true);
  });

  it('касание дня показывает его подробности', () => {
    renderOctober();
    fireEvent.click(cell('22 октября'));

    expect(screen.getByText('+12 мин')).toBeTruthy();
    expect(screen.getByText(/^Приход/)).toBeTruthy();
  });

  it('прогул объясняет, откуда он взялся', () => {
    renderOctober();
    fireEvent.click(cell('23 октября'));

    expect(screen.getByText('Не отмечался — прогул проставлен системой')).toBeTruthy();
  });

  it('без отметки за сегодня открыт последний отмеченный день', () => {
    renderOctober();

    expect(cell('26 октября').getAttribute('aria-pressed')).toBe('true');
  });
});
