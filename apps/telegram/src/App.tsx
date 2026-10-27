import React, { useState } from 'react';

import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Offers } from './screens/Offers';
import { Payroll } from './screens/Payroll';
import { Profile } from './screens/Profile';
import { Work } from './screens/Work';
import { useSession } from './session';
import { tap } from './telegram';
import { ErrorRetry, Icon, Splash } from './ui';

/**
 * Пять вкладок, как у Telegram: шесть на плавающей панели читались
 * мелко и тесно. Рейтинг отдела живёт в «Работе», награды — в профиле.
 */
const TABS = [
  { key: 'home', label: 'Главная', icon: 'home' },
  { key: 'work', label: 'Работа', icon: 'insights' },
  { key: 'offers', label: 'Сделки', icon: 'handshake' },
  { key: 'payroll', label: 'Зарплата', icon: 'payments' },
  { key: 'profile', label: 'Профиль', icon: 'person' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

/** Приложение для тех, у кого есть смены; остальным — панель в браузере. */
const FIELD_ROLES = ['MOP', 'ROP'];

export function App() {
  const { user, loading, signOut } = useSession();
  const [active, setActive] = useState<TabKey>('home');

  return (
    <>
      {/* Фон — в index.html: он виден уже на заставке и не перерисовывается. */}
      {loading ? (
        <Splash />
      ) : !user ? (
        <Login />
      ) : !FIELD_ROLES.includes(user.role) ? (
        <main className="login">
          <div className="login-inner center">
            <p className="login-subtitle">Это приложение для менеджеров. Руководителям — панель в браузере.</p>
            <div style={{ height: 24 }} />
            <button className="submit" onClick={signOut}>
              Выйти
            </button>
          </div>
        </main>
      ) : (
        <Shell active={active} onSelect={setActive} />
      )}
    </>
  );
}

function Shell({ active, onSelect }: { active: TabKey; onSelect(key: TabKey): void }) {
  const index = TABS.findIndex((tab) => tab.key === active);

  function select(key: TabKey) {
    if (key !== active) tap();
    onSelect(key);
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <main className="screen">
        <ScreenBoundary key={active}>
          {active === 'home' ? <Home onOpenProfile={() => select('profile')} /> : null}
          {active === 'offers' ? <Offers /> : null}
          {active === 'payroll' ? <Payroll /> : null}
          {active === 'work' ? <Work /> : null}
          {active === 'profile' ? <Profile /> : null}
        </ScreenBoundary>
      </main>

      <nav
        className="tabbar"
        style={{ '--tabs': TABS.length, '--index': index } as React.CSSProperties}
      >
        <span className="tab-lens" aria-hidden="true" />
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${active === tab.key ? 'is-active' : ''}`}
            onClick={() => select(tab.key)}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}

/**
 * Сбой в одном экране не должен оставлять чёрное окно: React при ошибке
 * отрисовки снимает всё дерево. Ловим её здесь и предлагаем повторить.
 */
class ScreenBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.failed) {
      return <ErrorRetry message="Не удалось показать экран" onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
