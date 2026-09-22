import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

/**
 * Конфигурация берётся из окружения Expo: значения публичные по своей природе
 * (они видны в любом клиенте Firebase), доступ ограничивают правила
 * безопасности и проверки на бэкенде, а не секретность этих ключей.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Сессия сохраняется в AsyncStorage, иначе сотрудник вводил бы пароль
 * при каждом запуске приложения. По умолчанию React Native держит
 * авторизацию только в памяти.
 */
function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Hot reload в разработке инициализирует модуль повторно —
    // берём уже поднятый экземпляр.
    return getAuth(app);
  }
}

export const auth = createAuth();

// Локальная разработка через эмулятор Firebase Auth.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
}

/**
 * Свежий ID-токен для запроса к бэкенду. Firebase сам обновляет его,
 * когда до истечения остаётся немного, поэтому ручная ротация не нужна.
 */
export async function currentIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
