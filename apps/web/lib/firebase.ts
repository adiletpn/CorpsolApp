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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);

// Локальная разработка через эмулятор Firebase Auth.
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
if (emulatorHost && typeof window !== 'undefined') {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
}

/** Свежий токен для запроса к бэкенду. Firebase обновляет его сам. */
export async function currentIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
}
