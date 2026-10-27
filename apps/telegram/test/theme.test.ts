import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyAppearance,
  savedAppearance,
  saveAppearance,
  syncAppearanceFromCloud,
} from '../src/theme';

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

describe('цвет окна', () => {
  it('meta theme-color следует за темой', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);

    applyAppearance({ theme: 'sepia', accent: 'brand' });

    expect(meta.getAttribute('content')).toBe('#f5f0e6');
    meta.remove();
  });
});

describe('оформление на всех устройствах', () => {
  const cloud = new Map<string, string>();

  beforeEach(() => {
    cloud.clear();
    window.Telegram = {
      WebApp: {
        initData: 'query_id=1',
        colorScheme: 'dark',
        ready() {},
        expand() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        CloudStorage: {
          getItem: (key: string, done: (error: string | null, value?: string) => void) =>
            done(null, cloud.get(key) ?? ''),
          setItem: (key: string, value: string) => void cloud.set(key, value),
        },
      },
    } as unknown as Window['Telegram'];
  });

  afterEach(() => {
    delete window.Telegram;
  });

  it('выбор уходит в облако Telegram', () => {
    saveAppearance({ theme: 'midnight', accent: 'rose' });

    expect(JSON.parse(cloud.get('corpsol.appearance')!)).toEqual({ theme: 'midnight', accent: 'rose' });
  });

  it('выбор с другого устройства применяется при запуске', async () => {
    // На телефоне выбрали «Полночь», на Mac локально ничего нет.
    cloud.set('corpsol.appearance', JSON.stringify({ theme: 'midnight', accent: 'ocean' }));

    await syncAppearanceFromCloud();

    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(savedAppearance()).toEqual({ theme: 'midnight', accent: 'ocean' });
  });
});
