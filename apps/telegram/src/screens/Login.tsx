import React, { useEffect, useState } from 'react';

import { signInErrorText, useSession } from '../session';
import { Gap, Icon, Message, Panel } from '../ui';

export function Login() {
  const { signIn, blocked } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // После пароля сервер ещё сверяет Telegram — кнопка ждёт до конца,
  // а не гаснет на полпути, будто ничего не произошло.
  useEffect(() => {
    if (blocked) setBusy(false);
  }, [blocked]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // Успех: экран сменится сам, когда сервер откроет сессию.
    } catch (cause) {
      setError(signInErrorText(cause));
      setBusy(false);
    }
  }

  const message = error ?? blocked;

  return (
    <main className="login">
      <form className="login-inner" onSubmit={submit}>
        {/* Знак — единственное украшение: дальше начинается работа. */}
        <div className="mark">
          <Icon name="headset_mic" />
        </div>
        <div className="login-title">CorpSol</div>
        <div className="login-subtitle">Вход для менеджера</div>
        <div style={{ height: 32 }} />

        {/* Поля одной панелью, как списки на остальных экранах. */}
        <Panel>
          <div className="field-row">
            <label>
              <span>Рабочая почта</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              <span>Пароль</span>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            {/* Показать пароль дешевле, чем разбираться, почему вход «не работает» из-за раскладки. */}
            <button
              type="button"
              className="text-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
            </button>
          </div>
        </Panel>

        {message ? (
          <>
            <Gap size={2} />
            <Message tone="danger" icon="error">
              {message}
            </Message>
          </>
        ) : null}

        <div style={{ height: 24 }} />
        <button className="submit" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner is-small is-light" /> Входим…
            </>
          ) : (
            'Войти'
          )}
        </button>
        <div style={{ height: 32 }} />
        <p className="login-footnote">
          <Icon name="phonelink_lock" />
          Вход только со своего Telegram
        </p>
      </form>
    </main>
  );
}
