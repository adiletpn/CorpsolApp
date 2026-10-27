/**
 * Тонкая обёртка над Telegram Mini Apps.
 *
 * Скрипт telegram-web-app.js подключается в index.html и кладёт объект
 * в window.Telegram.WebApp. Вне Telegram (в обычном браузере при
 * разработке) его нет — тогда работают запасные пути: геолокация браузера,
 * localStorage, а сканер QR недоступен.
 */

interface LocationData {
  latitude: number;
  longitude: number;
  horizontal_accuracy: number | null;
}

type StorageCallback = (error: string | null, value?: string | null) => void;

interface KeyValueStorage {
  getItem(key: string, callback: StorageCallback): void;
  setItem(key: string, value: string, callback?: (error: string | null) => void): void;
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
  SecureStorage?: KeyValueStorage;
  DeviceStorage?: KeyValueStorage;
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

function storageGet(storage: KeyValueStorage, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      storage.getItem(key, (error, value) => resolve(error ? null : (value ?? null)));
    } catch {
      resolve(null);
    }
  });
}

function storageSet(storage: KeyValueStorage, key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      storage.setItem(key, value, (error) => resolve(!error));
    } catch {
      resolve(false);
    }
  });
}

const DEVICE_KEY = 'corpsol.deviceId';

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

let cachedDeviceId: Promise<string> | null = null;

/**
 * Идентификатор телефона для привязки «один аккаунт — один телефон».
 *
 * Системного идентификатора железа Telegram не даёт, поэтому создаём
 * случайный и прячем в SecureStorage — это Keychain на iOS и Keystore
 * на Android, он живёт на самом устройстве. Сотрудник не перенесёт его
 * на другой телефон, а вход с компьютера даст «новое устройство».
 */
export function deviceId(): Promise<string> {
  cachedDeviceId ??= resolveDeviceId();
  return cachedDeviceId;
}

async function resolveDeviceId(): Promise<string> {
  const app = webApp();
  const stores = [app?.SecureStorage, app?.DeviceStorage].filter(
    (store): store is KeyValueStorage => Boolean(store),
  );

  for (const store of stores) {
    const existing = await storageGet(store, DEVICE_KEY);
    if (existing) return existing;
  }

  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && stores.length === 0) return existing;
  } catch {
    // Хранилище браузера может быть закрыто — тогда только хранилища Telegram.
  }

  const created = randomId();
  for (const store of stores) {
    if (await storageSet(store, DEVICE_KEY, created)) break;
  }
  try {
    localStorage.setItem(DEVICE_KEY, created);
  } catch {
    // См. выше.
  }
  return created;
}

/** Платформа для карточки устройства в панели: «telegram-ios», «telegram-android». */
export function devicePlatform(): string {
  return `telegram-${webApp()?.platform ?? 'web'}`;
}

export function telegramVersion(): string | undefined {
  return webApp()?.version;
}
