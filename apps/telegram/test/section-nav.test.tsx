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
