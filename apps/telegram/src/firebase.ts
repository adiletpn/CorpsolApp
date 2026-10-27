import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  initializeAuth,
  indexedDBLocalPersistence,
} from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'local',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'corpsol-local',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

/**
 * Сессия переживает закрытие мини-аппа: сотрудник вводит пароль один раз.
 * IndexedDB в WebView Telegram бывает недоступна — тогда localStorage.
 */
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (emulator) connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
