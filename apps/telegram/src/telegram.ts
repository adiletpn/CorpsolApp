/**
 * Тонкая обёртка над Telegram Mini Apps.
 *
 * Скрипт telegram-web-app.js подключается в index.html и кладёт объект
 * в window.Telegram.WebApp. Вне Telegram (в обычном браузере при
 * разработке) его нет — тогда геолокация берётся из браузера, сканер QR
 * недоступен, а сотрудника-менеджера сервер не пустит: нет аккаунта Telegram.
 */

interface LocationData {
  latitude: number;
  longitude: number;
  horizontal_accuracy: number | null;
}

interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  colorScheme: 'light' | 'dark';
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?: () => void;
  onEvent(event: string, handler: () => void): void;
  showScanQrPopup(params: { text?: string }, callback: (text: string) => boolean | void): void;
  closeScanQrPopup(): void;
  showAlert(message: string): void;
  CloudStorage?: {
    getItem(key: string, callback: (error: string | null, value?: string) => void): void;
    setItem(key: string, value: string, callback?: (error: string | null) => void): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: {
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted: boolean;
    isAccessRequested: boolean;
    init(callback?: () => void): void;
    getLocation(callback: (data: LocationData | null) => void): void;
    openSettings(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Объект Mini App, если страница открыта внутри Telegram. */
export function webApp(): TelegramWebApp | null {
  const app = window.Telegram?.WebApp;
  // Скрипт создаёт объект и в обычном браузере, но initData там пустая.
  return app && app.initData ? app : null;
}

export function colorScheme(): 'light' | 'dark' {
  const app = webApp();
  if (app) return app.colorScheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Подготовка окна: развернуть на весь экран и покрасить шапку под фон. */
export function prepareWindow(background: string): void {
  const app = webApp();
  if (!app) return;

  app.ready();
  app.expand();
  // Свайп вниз закрывает мини-апп — в длинных списках это мешает листать.
  app.disableVerticalSwipes?.();
  try {
    app.setHeaderColor(background);
    app.setBackgroundColor(background);
  } catch {
    // Старые клиенты не умеют красить шапку — это только оформление.
  }
}

/** Подписка на смену темы в самом Telegram — пока мини-апп открыт. */
export function onTelegramThemeChange(handler: () => void): void {
  webApp()?.onEvent('themeChanged', handler);
}

/**
 * Пока идёт отметка, закрытие мини-аппа переспрашивается: смахнул
 * случайно — запрос оборвался, и непонятно, засчитан ли приход.
 */
export function confirmClosing(enabled: boolean): void {
  const app = webApp();
  if (enabled) app?.enableClosingConfirmation?.();
  else app?.disableClosingConfirmation?.();
}

/**
 * Облачное хранилище Telegram: значение видно на всех устройствах
 * пользователя. Вне Telegram или в старом клиенте — тихо ничего.
 */
export function cloudGet(key: string): Promise<string | null> {
  const storage = webApp()?.CloudStorage;
  if (!storage) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      storage.getItem(key, (error, value) => resolve(error ? null : value || null));
    } catch {
      resolve(null);
    }
  });
}

export function cloudSet(key: string, value: string): void {
  try {
    webApp()?.CloudStorage?.setItem(key, value);
  } catch {
    // Не сохранилось в облаке — останется на этом устройстве.
  }
}

/**
 * Системная кнопка «Назад» в шапке Telegram — для вложенных экранов.
 * Возвращает отписку: экран при закрытии прячет кнопку за собой.
 */
export function showBackButton(onBack: () => void): () => void {
  const button = webApp()?.BackButton;
  if (!button) return () => undefined;

  button.onClick(onBack);
  button.show();
  return () => {
    button.offClick(onBack);
    button.hide();
  };
}

export function haptic(type: 'error' | 'success' | 'warning'): void {
  webApp()?.HapticFeedback?.notificationOccurred(type);
}

export function tap(): void {
  webApp()?.HapticFeedback?.impactOccurred('light');
}

/** Сканер QR есть только в мобильных клиентах Telegram. */
export function canScanQr(): boolean {
  const app = webApp();
  return Boolean(app && ['ios', 'android'].includes(app.platform));
}

/**
 * Скан QR встроенным сканером Telegram.
 *
 * Возвращает строку кода или null, если человек закрыл сканер.
 * Камера отдаёт код несколько раз подряд — берём первый и закрываем окно.
 */
export function scanQr(text: string): Promise<string | null> {
  const app = webApp();
  if (!app) return Promise.resolve(null);

  return new Promise((resolve) => {
    let done = false;

    app.onEvent('scanQrPopupClosed', () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });

    app.showScanQrPopup({ text }, (value) => {
      if (done) return true;
      done = true;
      resolve(value);
      return true;
    });
  });
}

export interface Position {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export class LocationError extends Error {
  constructor(
    message: string,
    readonly canOpenSettings = false,
  ) {
    super(message);
  }
}

/**
 * Координаты для геозоны.
 *
 * В Telegram 8.0+ — через LocationManager: в WebView Android запрос
 * геолокации браузера часто молча отклоняется. Иначе — геолокация браузера.
 */
export async function readPosition(): Promise<Position> {
  const manager = webApp()?.isVersionAtLeast('8.0') ? webApp()?.LocationManager : undefined;
  if (manager) return readFromTelegram(manager);
  return readFromBrowser();
}

function readFromTelegram(manager: NonNullable<TelegramWebApp['LocationManager']>): Promise<Position> {
  return new Promise((resolve, reject) => {
    const read = () => {
      if (!manager.isLocationAvailable) {
        reject(new LocationError('На устройстве недоступна геолокация.'));
        return;
      }

      // Отказ, данный раньше, Telegram помнит: повторного вопроса не будет,
      // разрешение включается только в настройках.
      if (manager.isAccessRequested && !manager.isAccessGranted) {
        reject(new LocationError('Разрешите Telegram доступ к геолокации для этого приложения.', true));
        return;
      }

      manager.getLocation((data) => {
        if (!data) {
          reject(new LocationError('Без геолокации приход не отметить — разрешите доступ.', true));
          return;
        }
        resolve({
          lat: data.latitude,
          lng: data.longitude,
          accuracyMeters: data.horizontal_accuracy ?? 9999,
        });
      });
    };

    if (manager.isInited) read();
    else manager.init(read);
  });
}

function readFromBrowser(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new LocationError('На устройстве недоступна геолокация.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }),
      () => reject(new LocationError('Без геолокации приход не отметить — разрешите доступ.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

export function openLocationSettings(): void {
  webApp()?.LocationManager?.openSettings();
}

/**
 * Подписанная строка запуска. По ней сервер узнаёт аккаунт Telegram:
 * подпись считается от токена бота, поэтому чужой аккаунт не подставить.
 */
export function initData(): string | null {
  return webApp()?.initData || null;
}

/** Где открыт мини-апп — для карточки устройства в панели: «telegram-ios», «telegram-macos». */
export function devicePlatform(): string {
  return `telegram-${webApp()?.platform ?? 'web'}`;
}

export function telegramVersion(): string | undefined {
  return webApp()?.version;
}
