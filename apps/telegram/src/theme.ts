import { colorScheme, prepareWindow } from './telegram';

/** Выбор темы, как во Flutter: как в Telegram, светлая или тёмная. */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'corpsol.theme';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

export const THEME_ICONS: Record<ThemeMode, string> = {
  system: 'brightness_auto',
  light: 'light_mode',
  dark: 'dark_mode',
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Как в Telegram',
  light: 'Светлая',
  dark: 'Тёмная',
};

export function savedTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    return ORDER.includes(value as ThemeMode) ? (value as ThemeMode) : 'system';
  } catch {
    return 'system';
  }
}

/** Красит страницу и шапку Telegram под выбранную тему. */
export function applyTheme(mode: ThemeMode): void {
  const scheme = mode === 'system' ? colorScheme() : mode;
  document.documentElement.dataset.theme = scheme;
  prepareWindow(scheme === 'light' ? '#f2f3f9' : '#0a0a0e');
}

export function nextTheme(mode: ThemeMode): ThemeMode {
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Без хранилища выбор просто не переживёт перезапуск.
  }
  applyTheme(next);
  return next;
}
