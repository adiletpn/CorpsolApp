import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: { currentUser: null } }));

import { ScreenBoundary } from '../src/App';

let broken = true;
function Flaky() {
  if (broken) throw new Error('data.map is not a function');
  return <p>Работа</p>;
}

describe('сбой экрана', () => {
  it('вместо чёрного окна — сообщение и повтор', () => {
    // Именно так выглядел баг «Работы»: экран падал, React снимал всё дерево.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ScreenBoundary>
        <Flaky />
      </ScreenBoundary>,
    );

    expect(screen.getByText('Не удалось показать экран')).toBeTruthy();

    broken = false;
    fireEvent.click(screen.getByText('Повторить'));
    expect(screen.getByText('Работа')).toBeTruthy();
  });
});
