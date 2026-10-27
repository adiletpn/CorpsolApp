import React, { useState } from 'react';

import { signInErrorText, useSession } from '../session';

export function Login() {
  const { signIn, blocked } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(signInErrorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? blocked;

  return (
    <main className="login">
      <div className="login-brand">
        <div className="logo">
          corp<span>sol</span>
        </div>
        <p>Рабочий день менеджера — в одном месте</p>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label className="field">
          <span>Логин</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="name@company.kz"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {message ? <p className="note note-error">{message}</p> : null}

        <button className="button button-primary button-large" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <p className="muted small center">Логин и пароль выдаёт руководитель.</p>
      </form>
    </main>
  );
}
