'use client';

import React, { useState } from 'react';

import { SessionProvider } from '../lib/session';
import { Shell } from '../components/Shell';
import { Overview } from '../components/screens/Overview';
import { Employees } from '../components/screens/Employees';
import { Devices } from '../components/screens/Devices';
import { Settings } from '../components/screens/Settings';
import { Integrations } from '../components/screens/Integrations';
import { Plans } from '../components/screens/Plans';
import { Calls } from '../components/screens/Calls';
import { WorkNumbers } from '../components/screens/WorkNumbers';
import { Offers } from '../components/screens/Offers';
import { Payroll } from '../components/screens/Payroll';
import { Leaderboard } from '../components/screens/Leaderboard';
import { Audit } from '../components/screens/Audit';
import { Schedules } from '../components/screens/Schedules';

/**
 * Панель — одна страница с переключением разделов состоянием.
 * Маршрутизация здесь не нужна: разделов немного, а экран терминала
 * живёт отдельной страницей, потому что открывается по своей ссылке.
 */
function Panel() {
  const [section, setSection] = useState('overview');

  const screens: Record<string, React.ReactNode> = {
    overview: <Overview />,
    employees: <Employees />,
    devices: <Devices />,
    plans: <Plans />,
    offers: <Offers />,
    calls: <Calls />,
    'work-numbers': <WorkNumbers />,
    payroll: <Payroll />,
    leaderboard: <Leaderboard />,
    audit: <Audit />,
    schedules: <Schedules />,
    settings: <Settings />,
    integrations: <Integrations />,
  };

  return (
    <Shell active={section} onNavigate={setSection}>
      {screens[section] ?? <Overview />}
    </Shell>
  );
}

export default function HomePage() {
  return (
    <SessionProvider>
      <Panel />
    </SessionProvider>
  );
}
