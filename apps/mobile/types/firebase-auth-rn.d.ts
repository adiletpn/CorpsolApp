/**
 * Пакет `firebase/auth` собран под несколько платформ. Metro подключает
 * React-Native-сборку, в которой есть `getReactNativePersistence`, но
 * TypeScript резолвит объявления веб-сборки, где этого экспорта нет.
 *
 * Дописываем недостающую сигнатуру, чтобы не глушить проверку через
 * `@ts-expect-error` в рабочем коде. Типы скопированы из объявлений пакета:
 * node_modules/firebase/node_modules/@firebase/auth/dist/auth-public.d.ts
 *
 * Импорт верхнего уровня обязателен: без него файл считается глобальным
 * скриптом, и declare module подменил бы весь модуль вместо дополнения.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  /** Контракт хранилища, который Firebase ожидает от AsyncStorage. */
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(
    storage: ReactNativeAsyncStorage,
  ): Persistence;
}
