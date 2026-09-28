'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

/**
 * Конфигурация Firebase публична по своей природе — она видна в любом
 * клиенте. Доступ ограничивают правила безопасности и проверки прав
 * на бэкенде, а не секретность этих значений.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

let cached: Auth | null = null;

/**
 * Firebase поднимается лениво и только в браузере.
 *
 * Инициализация на уровне модуля выполнялась бы и при сборке страницы
 * на сервере, где ключей нет, — сборка падала бы с `auth/invalid-api-key`.
 * А на рабочем сервере это был бы лишний экземпляр там, где он не нужен.
 */
export function getAuthClient(): Auth {
  if (typeof window === 'undefined') {
    throw new Error('Firebase Auth доступен только в браузере');
  }

  if (cached) return cached;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  cached = getAuth(app);

  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost) {
    connectAuthEmulator(cached, `http://${emulatorHost}`, { disableWarnings: true });
  }

  return cached;
}

/** Свежий токен для запроса к бэкенду. Firebase обновляет его сам. */
export async function currentIdToken(): Promise<string | null> {
  const user = getAuthClient().currentUser;
  return user ? user.getIdToken() : null;
}
