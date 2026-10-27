import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RingMeter, StackedBar } from '../src/charts';

afterEach(cleanup);

describe('метр-кольцо', () => {
  it('перевыполнение не рисует кольцо больше круга', () => {
    const { container } = render(<RingMeter ratio={1.06} label="Выручка" caption="выполнен" complete />);

    const value = container.querySelector('.ring-value')!;
    const [drawn, length] = value.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    // Процент честный — 106, а дуга не длиннее окружности.
    expect(screen.getByText('106%')).toBeTruthy();
    expect(drawn).toBeCloseTo(length);
  });

  it('диктор слышит план целиком, а не только процент', () => {
    render(<RingMeter ratio={0.82} label="Звонки" caption="ещё 46 из 260" complete={false} />);

    expect(screen.getByLabelText('Звонки: 82%, ещё 46 из 260')).toBeTruthy();
  });
});

describe('составная полоса', () => {
  const segments = [
    { key: 'accepted', label: 'Приняты', value: 3, color: 'green' },
    { key: 'sent', label: 'В работе', value: 0, color: 'blue' },
    { key: 'lost', label: 'Не состоялись', value: 1, color: 'red' },
  ];

  it('пустой сегмент не рисуется, но в легенде остаётся', () => {
    const { container } = render(<StackedBar segments={segments} caption="Сделки" />);

    // «0 в работе» — тоже ответ, а пустая полоска шириной в 4px — шум.
    expect(container.querySelectorAll('.stacked-segment')).toHaveLength(2);
    expect(screen.getByText('В работе')).toBeTruthy();
  });

  it('доли пропорциональны значениям', () => {
    const { container } = render(<StackedBar segments={segments} caption="Сделки" />);

    const grow = [...container.querySelectorAll<HTMLElement>('.stacked-segment')].map((node) => node.style.flexGrow);
    expect(grow).toEqual(['3', '1']);
  });

  it('значения в легенде — текстом, это и есть таблица', () => {
    render(
      <StackedBar
        caption="Зарплата"
        segments={[{ key: 'base', label: 'Оклад', value: 30000000, color: 'blue', display: '300 000 ₸' }]}
      />,
    );

    expect(screen.getByText('300 000 ₸')).toBeTruthy();
  });

  it('пустые данные — пустая полоса, а не деление на ноль', () => {
    const { container } = render(
      <StackedBar caption="Пусто" segments={[{ key: 'a', label: 'А', value: 0, color: 'blue' }]} />,
    );

    expect(container.querySelectorAll('.stacked-segment')).toHaveLength(0);
  });
});
