import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, request } from '../api/client';
import type { AuthUser } from '../api/types';
import { getDeviceDescriptor } from '../lib/device';
import { auth } from '../lib/firebase';

interface AuthState {
  user: AuthUser | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  /**
   * Открывает прикладную сессию: закрепляет аккаунт за этим телефоном
   * и забирает профиль. Отказ по устройству прилетает именно отсюда.
   */
  const openSession = useCallback(async (): Promise<AuthUser> => {
    const device = await getDeviceDescriptor();
    return request<AuthUser>('/auth/session', { method: 'POST', body: { device } });
  }, []);

  // Firebase восстанавливает сессию из хранилища сам, поэтому подписка
  // срабатывает и при холодном старте приложения.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setInitializing(false);
        return;
      }

      try {
        setUser(await openSession());
      } catch {
        // Устройство откреплено или сотрудник уволен — держать
        // авторизацию Firebase в этом случае незачем.
        await signOut(auth).catch(() => undefined);
        setUser(null);
      } finally {
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, [openSession]);

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);

      try {
        setUser(await openSession());
      } catch (cause) {
        // Firebase уже пустил в аккаунт, но телефон не тот. Выходим,
        // иначе приложение осталось бы в подвешенном состоянии.
        await signOut(auth).catch(() => undefined);
        throw cause;
      }
    },
    [openSession],
  );

  const handleSignOut = useCallback(async () => {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await signOut(auth);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, initializing, signIn: handleSignIn, signOut: handleSignOut }),
    [user, initializing, handleSignIn, handleSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth используется вне AuthProvider');
  return context;
}

export { ApiError };
