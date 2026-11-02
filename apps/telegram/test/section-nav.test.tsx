import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Anchor, SectionNav } from '../src/SectionNav';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderNav() {
  render(
    <>
      <SectionNav sections={[{ id: 'today', label: 'Сегодня' }, { id: 'month', label: 'Табель' }]} />
      <Anchor id="today" />
      <Anchor id="month" />
    </>,
  );
  // jsdom не раскладывает страницу: ставим разделу место на экране.
  vi.spyOn(document.getElementById('month')!, 'getBoundingClientRect').mockReturnValue({ top: 900 } as DOMRect);
}

describe('строка разделов', () => {
  it('касание прокручивает окно к разделу, под строку', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as never;
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Табель' }));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 900 - 64 }));
    expect(screen.getByRole('button', { name: 'Табель' }).getAttribute('aria-current')).toBe('location');
  });

  it('прокрутка экрана не прерывается прокруткой чипа', () => {
    window.scrollTo = vi.fn() as never;
    const intoView = vi.fn();
    Element.prototype.scrollIntoView = intoView;
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Табель' }));

    // scrollIntoView на чипе в Safari обрывал плавную прокрутку окна.
    expect(intoView).not.toHaveBeenCalled();
  });
});

describe('подсветка при открытии экрана', () => {
  it('короткая страница без прокрутки — первый раздел, а не последний', () => {
    // Пока данные грузятся, страница короткая и «в самом низу» с первого
    // кадра: раньше из-за этого загорался последний раздел.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { top: this.id === 'month' ? 900 : 0 } as DOMRect;
    });

    render(
      <>
        <SectionNav sections={[{ id: 'today', label: 'Сегодня' }, { id: 'month', label: 'Табель' }]} />
        <Anchor id="today" />
        <Anchor id="month" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Сегодня' }).getAttribute('aria-current')).toBe('location');
  });
});
