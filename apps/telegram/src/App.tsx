import React, { useState } from 'react';

import { MoneyIcon, RatingIcon, TodayIcon, WorkIcon } from './icons';
import { Login } from './screens/Login';
import { Money } from './screens/Money';
import { Rating } from './screens/Rating';
import { Today } from './screens/Today';
import { Work } from './screens/Work';
import { useSession } from './session';
import { tap } from './telegram';

const TABS = [
  { key: 'today', label: 'Сегодня', icon: TodayIcon, screen: Today },
  { key: 'work', label: 'Работа', icon: WorkIcon, screen: Work },
  { key: 'money', label: 'Деньги', icon: MoneyIcon, screen: Money },
  { key: 'rating', label: 'Рейтинг', icon: RatingIcon, screen: Rating },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Приложение для тех, у кого есть смены; остальным — панель в браузере. */
const FIELD_ROLES = ['MOP', 'ROP'];

export function App() {
  const { user, loading, signOut } = useSession();
  const [active, setActive] = useState<TabKey>('today');

  if (loading) {
    return (
      <main className="splash">
        <div className="logo">
          corp<span>sol</span>
        </div>
      </main>
    );
  }

  if (!user) return <Login />;

  if (!FIELD_ROLES.includes(user.role)) {
    return (
      <main className="login">
        <div className="login-brand">
          <div className="logo">
            corp<span>sol</span>
          </div>
          <p>Это приложение для менеджеров. Руководителям — панель в браузере.</p>
        </div>
        <button className="button button-ghost button-large" onClick={signOut}>
          Выйти
        </button>
      </main>
    );
  }

  const Screen = TABS.find((tab) => tab.key === active)!.screen;

  return (
    <div className="app">
      <main className="screen" key={active}>
        <Screen />
      </main>

      <nav className="tabbar">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`tab ${active === key ? 'is-active' : ''}`}
            onClick={() => {
              if (key !== active) tap();
              setActive(key);
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
