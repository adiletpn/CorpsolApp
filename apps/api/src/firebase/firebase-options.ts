import type { AppOptions } from 'firebase-admin/app';
import { cert } from 'firebase-admin/app';

/** Откуда берутся настройки. Отделено, чтобы разбор проверялся без Nest. */
export interface ConfigReader {
  get(key: string): string | undefined;
}

export const usesEmulator = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);

/**
 * Ключ сервисного аккаунта хранится в .env одной строкой, где переводы
 * строк экранированы. Без обратной замены Admin SDK молча не проходит
 * подпись, и это видно только на боевом проекте.
 */
export const restoreNewlines = (privateKey: string): string =>
  privateKey.replace(/\\n/g, '\n');

export class MissingFirebaseCredentials extends Error {
  constructor(key: string) {
    super(
      `Не задано ${key}. Для боевого проекта нужны FIREBASE_PROJECT_ID, ` +
        'FIREBASE_CLIENT_EMAIL и FIREBASE_PRIVATE_KEY.',
    );
  }
}

/**
 * Настройки подключения. На эмуляторах подпись не проверяется, поэтому
 * сервисный ключ там не нужен — достаточно идентификатора проекта.
 */
export function buildFirebaseOptions(
  config: ConfigReader,
  env: NodeJS.ProcessEnv = process.env,
): AppOptions {
  const projectId = config.get('FIREBASE_PROJECT_ID');

  if (usesEmulator(env)) {
    return { projectId: projectId || 'corpsol-local' };
  }

  const required = (key: string): string => {
    const value = config.get(key);
    if (!value) throw new MissingFirebaseCredentials(key);
    return value;
  };

  return {
    credential: cert({
      projectId: required('FIREBASE_PROJECT_ID'),
      clientEmail: required('FIREBASE_CLIENT_EMAIL'),
      privateKey: restoreNewlines(required('FIREBASE_PRIVATE_KEY')),
    }),
  };
}
