import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, request } from '../api/client';
import type { AuthUser, LoginResponse } from '../api/types';
import { getDeviceDescriptor } from '../lib/device';
import { clearTokens, loadTokens, saveTokens } from '../lib/storage';

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

  // Восстановление сессии при запуске: токены лежат в защищённом хранилище.
  useEffect(() => {
    void (async () => {
      try {
        const tokens = await loadTokens();
        if (!tokens) return;
        const profile = await request<AuthUser>('/auth/me');
        setUser(profile);
      } catch {
        await clearTokens();
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Дескриптор устройства уходит вместе с логином — на нём держится привязка аккаунта.
    const device = await getDeviceDescriptor();

    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim().toLowerCase(), password, device },
    });

    await saveTokens(result);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, initializing, signIn, signOut }),
    [user, initializing, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth используется вне AuthProvider');
  return context;
}

export { ApiError };
