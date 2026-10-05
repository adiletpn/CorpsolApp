'use client';

import React from 'react';
import { ROLE_LABELS, type Permission } from '@corpsol/shared';

import { useSession } from '../lib/session';
import { LoginForm } from './LoginForm';

interface NavItem {
  key: string;
  label: string;
  /** Раздел виден, если есть хотя бы одно из прав. */
  permissions: Permission[];
}

/**
 * Состав меню собирается из той же матрицы прав, что проверяет сервер.
 * Скрытый раздел — это удобство, а не защита: попытка обратиться напрямую
 * к чужим данным отклоняется бэкендом независимо от вида меню.
 */
const NAV: NavItem[] = [
  { key: 'overview', label: 'Сводка', permissions: ['analytics.company', 'analytics.department'] },
  { key: 'employees', label: 'Сотрудники', permissions: ['employee.read.all', 'employee.read.department'] },
  { key: 'devices', label: 'Устройства', permissions: ['device.unbind'] },
  { key: 'plans', label: 'Планы', permissions: ['plan.read.all', 'plan.read.department'] },
  { key: 'offers', label: 'Сделки', permissions: ['offer.read.all', 'offer.read.department'] },
  { key: 'calls', label: 'Звонки', permissions: ['calls.read.all', 'calls.read.department'] },
  { key: 'work-numbers', label: 'Рабочие номера', permissions: ['integration.manage'] },
  { key: 'payroll', label: 'Зарплата', permissions: ['payroll.read.all', 'payroll.read.department'] },
  { key: 'leaderboard', label: 'Рейтинг', permissions: ['leaderboard.read'] },
  { key: 'achievements', label: 'Достижения', permissions: ['leaderboard.read'] },
  { key: 'schedules', label: 'Графики', permissions: ['settings.manage', 'attendance.adjust'] },
  { key: 'audit', label: 'Журнал', permissions: ['audit.read'] },
  { key: 'settings', label: 'Настройки', permissions: ['settings.manage', 'office.manage'] },
  { key: 'integrations', label: 'Интеграции', permissions: ['integration.manage'] },
];

export function Shell({
  active,
  onNavigate,
  children,
}: {
  active: string;
  onNavigate: (key: string) => void;
  children: React.ReactNode;
}) {
  const { session, loading, signOut, can } = useSession();

  if (loading) {
    return <main style={styles.center}>Загрузка…</main>;
  }

  if (!session) return <LoginForm />;

  const items = NAV.filter((item) => item.permissions.some((permission) => can(permission)));

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>CorpSol</div>

        <nav style={styles.nav}>
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              style={{
                ...styles.navItem,
                ...(active === item.key ? styles.navItemActive : {}),
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div style={styles.user}>
          <div style={styles.userName}>{session.email}</div>
          <div style={styles.userRole}>{ROLE_LABELS[session.role]}</div>
          <button style={styles.signOut} onClick={signOut}>
            Выйти
          </button>
        </div>
      </aside>

      <main style={styles.content}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  layout: { display: 'flex', minHeight: '100vh' },
  sidebar: {
    width: 240,
    background: 'var(--surface)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    flexShrink: 0,
  },
  brand: { fontSize: 22, fontWeight: 700 },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  navItem: {
    background: 'transparent',
    border: 'none',
    borderRadius: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 15,
    padding: '10px 12px',
    textAlign: 'left',
  },
  navItemActive: { background: 'var(--surface-muted)', color: 'var(--text)' },
  user: { borderTop: '1px solid var(--border)', paddingTop: 16 },
  userName: { fontSize: 13, wordBreak: 'break-all' },
  userRole: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  signOut: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 13,
    marginTop: 10,
    padding: 0,
    textDecoration: 'underline',
  },
  content: { flex: 1, padding: 32, maxWidth: 1200 },
};
