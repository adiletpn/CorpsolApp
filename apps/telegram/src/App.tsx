import React, { useState } from 'react';

import { Achievements } from './screens/Achievements';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Login } from './screens/Login';
import { Offers } from './screens/Offers';
import { Payroll } from './screens/Payroll';
import { Work } from './screens/Work';
import { useSession } from './session';
import { tap } from './telegram';
import { Icon, Spinner } from './ui';

/** Вкладки и их порядок — как в приложении на Flutter, переучиваться не нужно. */
const TABS = [
  { key: 'home', label: 'Приход', icon: 'how_to_reg', screen: Home },
  { key: 'offers', label: 'Сделки', icon: 'handshake', screen: Offers },
  { key: 'payroll', label: 'Зарплата', icon: 'payments', screen: Payroll },
  { key: 'work', label: 'Работа', icon: 'insights', screen: Work },
  { key: 'rating', label: 'Рейтинг', icon: 'leaderboard', screen: Leaderboard },
  { key: 'awards', label: 'Награды', icon: 'emoji_events', screen: Achievements },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Приложение для тех, у кого есть смены; остальным — панель в браузере. */
const FIELD_ROLES = ['MOP', 'ROP'];

export function App() {
  const { user, loading, signOut } = useSession();
  const [active, setActive] = useState<TabKey>('home');

  return (
    <>
      {/* Фон рисуется один раз под всеми вкладками: пятна не перескакивают. */}
      <div className="ambient" />
      {loading ? (
        <Spinner />
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
  const Screen = TABS.find((tab) => tab.key === active)!.screen;

  return (
    <>
      <main className="screen" key={active}>
        <Screen />
      </main>

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${active === tab.key ? 'is-active' : ''}`}
            onClick={() => {
              if (tab.key !== active) tap();
              onSelect(tab.key);
            }}
          >
            <span className="tab-pill">
              <Icon name={tab.icon} />
            </span>
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
