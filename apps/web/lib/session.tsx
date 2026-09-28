'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { can, type Permission } from '@corpsol/shared';

import { ApiError, request } from './api';
import { auth } from './firebase';
import type { Session } from './types';

interface SessionState {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Проверка права для показа разделов меню и кнопок. */
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Панель предназначена руководителям. Менеджер сюда попасть не должен:
 * его рабочее место — мобильное приложение, где действует привязка
 * к устройству, а в браузере её нет.
 */
export class ManagerNotAllowed extends Error {
  constructor() {
    super('Панель доступна руководителям. Менеджеры работают в мобильном приложении.');
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<Session> => {
    // Панель заходит без дескриптора устройства — к телефону не привязывается.
    await request('/auth/session', { method: 'POST', body: {} });
    return request<Session>('/auth/me');
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await load();
        if (profile.role === 'MOP') throw new ManagerNotAllowed();
        setSession(profile);
      } catch {
        await signOut(auth).catch(() => undefined);
        setSession(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [load]);

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);

      try {
        const profile = await load();
        if (profile.role === 'MOP') throw new ManagerNotAllowed();
        setSession(profile);
      } catch (cause) {
        // Firebase уже пустил в аккаунт, но в панели ему делать нечего —
        // иначе приложение осталось бы в подвешенном состоянии.
        await signOut(auth).catch(() => undefined);
        throw cause;
      }
    },
    [load],
  );

  const handleSignOut = useCallback(async () => {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await signOut(auth);
    setSession(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading,
      signIn: handleSignIn,
      signOut: handleSignOut,
      can: (permission) => (session ? can(session.role, permission) : false),
    }),
    [session, loading, handleSignIn, handleSignOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession используется вне SessionProvider');
  return context;
}

export { ApiError };
