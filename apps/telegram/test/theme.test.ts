import { beforeEach, describe, expect, it } from 'vitest';

import { applyAppearance, savedAppearance, saveAppearance } from '../src/theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
});

describe('оформление', () => {
  it('по умолчанию — как в Telegram и фирменный цвет', () => {
    expect(savedAppearance()).toEqual({ theme: 'system', accent: 'brand' });
  });

  it('выбор переживает перезапуск', () => {
    saveAppearance({ theme: 'sepia', accent: 'emerald' });

    expect(savedAppearance()).toEqual({ theme: 'sepia', accent: 'emerald' });
  });

  it('испорченная запись не ломает запуск', () => {
    // Старая версия или ручная правка: приложение должно открыться, а не упасть.
    localStorage.setItem('corpsol.appearance', '{не json');

    expect(savedAppearance()).toEqual({ theme: 'system', accent: 'brand' });
  });

  it('неизвестная тема заменяется на системную', () => {
    localStorage.setItem('corpsol.appearance', JSON.stringify({ theme: 'neon', accent: 'rose' }));

    expect(savedAppearance()).toEqual({ theme: 'system', accent: 'rose' });
  });

  it('тема и акцент ставятся на корень документа', () => {
    applyAppearance({ theme: 'midnight', accent: 'ocean' });

    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(document.documentElement.dataset.accent).toBe('ocean');
  });

  it('«как в Telegram» вне Telegram берёт тему системы', () => {
    applyAppearance({ theme: 'system', accent: 'brand' });

    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
  });
});
