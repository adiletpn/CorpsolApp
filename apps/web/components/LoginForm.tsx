'use client';

import { FirebaseError } from 'firebase/app';
import React, { useState } from 'react';

import { ApiError, ManagerNotAllowed, useSession } from '../lib/session';
import { Button, ErrorText, Field, Input } from './ui';

/**
 * Неверный логин и неверный пароль сведены к одному тексту намеренно:
 * разные сообщения подсказали бы, какие адреса заведены в системе.
 */
const FIREBASE_HINTS: Record<string, string> = {
  'auth/invalid-email': 'Неверный email или пароль.',
  'auth/invalid-credential': 'Неверный email или пароль.',
  'auth/wrong-password': 'Неверный email или пароль.',
  'auth/user-not-found': 'Неверный email или пароль.',
  'auth/user-disabled': 'Учётная запись отключена.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
  'auth/network-request-failed': 'Нет связи с сервером.',
};

function describe(cause: unknown): string {
  if (cause instanceof ManagerNotAllowed) return cause.message;
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof FirebaseError) {
    return FIREBASE_HINTS[cause.code] ?? 'Не удалось войти. Попробуйте ещё раз.';
  }
  return 'Нет связи с сервером.';
}

export function LoginForm() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await signIn(email, password);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={styles.main}>
      <form style={styles.form} onSubmit={submit}>
        <div style={styles.title}>
          corp<span style={{ color: 'var(--accent)' }}>sol</span>
        </div>
        <p style={styles.subtitle}>Панель руководителей</p>

        <Field label="Рабочий email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Пароль">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <div style={{ marginTop: 16 }}>
          <Button type="submit" disabled={busy || password.length < 6} style={{ width: '100%' }}>
            {busy ? 'Входим…' : 'Войти'}
          </Button>
        </div>

        <p style={styles.notice}>
          Менеджеры отмечают приход в приложении в Telegram — там действует
          привязка к телефону.
        </p>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  form: {
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 24,
    padding: 36,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 24px 80px -24px rgba(124, 124, 248, 0.25)',
  },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-muted)',
    textAlign: 'center',
    margin: '4px 0 24px',
  },
  notice: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 0,
  },
};
