import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { ApiError, api, type AuthUser } from './api';
import { auth } from './firebase';

interface SessionState {
  user: AuthUser | null;
  loading: boolean;
  /** Почему сессию не открыли: чужой телефон, увольнение и т. п. */
  blocked: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Прикладной профиль приходит не из Firebase, а с нашего сервера:
 * именно он решает, пускать ли с этого телефона.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        try {
          setUser(await api.openSession());
          setBlocked(null);
        } catch (cause) {
          // Телефон не тот или сотрудник уволен — держать вход в Firebase незачем.
          setBlocked(cause instanceof ApiError ? cause.message : 'Не удалось войти.');
          setUser(null);
          await firebaseSignOut(auth).catch(() => undefined);
        } finally {
          setLoading(false);
        }
      }),
    [],
  );

  const value: SessionState = {
    user,
    loading,
    blocked,
    async signIn(email, password) {
      setBlocked(null);
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    },
    async signOut() {
      await api.closeSession().catch(() => undefined);
      await firebaseSignOut(auth);
      setUser(null);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession вне SessionProvider');
  return value;
}

/** Ошибки Firebase по-человечески: код «auth/invalid-credential» сотруднику ничего не скажет. */
export function signInErrorText(cause: unknown): string {
  const code = (cause as { code?: string })?.code ?? '';

  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
    return 'Неверный логин или пароль.';
  }
  if (code === 'auth/too-many-requests') return 'Слишком много попыток. Подождите пару минут.';
  if (code === 'auth/user-disabled') return 'Учётная запись отключена. Обратитесь к руководителю.';
  if (code === 'auth/network-request-failed') return 'Нет связи. Проверьте интернет.';
  return 'Не удалось войти. Попробуйте ещё раз.';
}
