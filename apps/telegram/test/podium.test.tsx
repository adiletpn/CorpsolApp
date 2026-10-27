import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import { Podium } from '../src/screens/Work';

afterEach(cleanup);

const entry = (userId: string, fullName: string, rank: number, points: number) => ({
  userId,
  fullName,
  rank,
  points,
  pointsBehindLeader: 0,
});

describe('пьедестал', () => {
  it('стоят как на награждении: второй, первый, третий', () => {
    const { container } = render(
      <Podium
        entries={[
          entry('a', 'Айгерим Нурланова', 1, 295),
          entry('b', 'Демо Менеджер', 2, 240),
          entry('c', 'Мадина Касымова', 3, 230),
        ]}
      />,
    );

    const steps = [...container.querySelectorAll('.podium-step')].map((node) => node.textContent);
    expect(steps).toEqual(['2', '1', '3']);
  });

  it('свою ступень сотрудник узнаёт по «Вы»', () => {
    const { container } = render(
      <Podium entries={[entry('a', 'Айгерим Нурланова', 1, 295), entry('me', 'Демо Менеджер', 2, 240)]} selfId="me" />,
    );

    expect(container.querySelector('.is-self .podium-name')?.textContent).toBe('Вы');
  });

  it('в отделе из двух человек третьей ступени нет', () => {
    const { container } = render(
      <Podium entries={[entry('a', 'Айгерим Нурланова', 1, 295), entry('b', 'Данияр Ахметов', 2, 185)]} />,
    );

    expect(container.querySelectorAll('.podium-place')).toHaveLength(2);
  });
});
