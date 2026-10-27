import { colorScheme, prepareWindow } from './telegram';

/**
 * Оформление: тема и акцентный цвет — как в настройках Mind AI.
 * «Фирменный» акцент — сине-фиолетовый градиент приложения на Flutter.
 */
export const THEMES = ['system', 'light', 'dark', 'sepia', 'midnight'] as const;
export type ThemeMode = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Как в Telegram',
  light: 'Светлая',
  dark: 'Тёмная',
  sepia: 'Бумага',
  midnight: 'Полночь',
};

export const ACCENTS = ['brand', 'indigo', 'emerald', 'ocean', 'amber', 'rose', 'graphite'] as const;
export type Accent = (typeof ACCENTS)[number];

export const ACCENT_LABELS: Record<Accent, string> = {
  brand: 'Фирменный',
  indigo: 'Индиго',
  emerald: 'Изумруд',
  ocean: 'Океан',
  amber: 'Янтарь',
  rose: 'Роза',
  graphite: 'Графит',
};

/** Образец цвета для кружка выбора — сама палитра живёт в styles.css. */
export const ACCENT_SWATCHES: Record<Accent, string> = {
  brand: 'linear-gradient(135deg, #3b5bff, #7c4dff)',
  indigo: '#6366f1',
  emerald: '#10a26b',
  ocean: '#0e8fd6',
  amber: '#d4880f',
  rose: '#e0466a',
  graphite: 'linear-gradient(135deg, #2a2a2f 50%, #ececef 50%)',
};

/** Фон каждой темы — им же красится шапка Telegram, чтобы не было шва. */
const BACKGROUNDS: Record<Exclude<ThemeMode, 'system'>, string> = {
  light: '#f2f3f9',
  dark: '#0a0a0e',
  sepia: '#f5f0e6',
  midnight: '#0c1220',
};

export interface Appearance {
  theme: ThemeMode;
  accent: Accent;
}

const KEY = 'corpsol.appearance';

export function savedAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>;
    return {
      theme: THEMES.includes(saved.theme as ThemeMode) ? (saved.theme as ThemeMode) : 'system',
      accent: ACCENTS.includes(saved.accent as Accent) ? (saved.accent as Accent) : 'brand',
    };
  } catch {
    return { theme: 'system', accent: 'brand' };
  }
}

/** Красит страницу и шапку Telegram под выбранное оформление. */
export function applyAppearance({ theme, accent }: Appearance): void {
  const resolved = theme === 'system' ? colorScheme() : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.accent = accent;
  prepareWindow(BACKGROUNDS[resolved]);
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance));
  } catch {
    // Без хранилища выбор просто не переживёт перезапуск.
  }
  applyAppearance(appearance);
}
