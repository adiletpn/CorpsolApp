'use client';

import React from 'react';
import { ROLE_LABELS, type Permission } from '@corpsol/shared';

import { useSession } from '../lib/session';
import { ExitIcon, SECTION_ICONS } from './icons';
import { LoginForm } from './LoginForm';
import { Notifications } from './Notifications';

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
  { key: 'absences', label: 'Прогулы', permissions: ['attendance.adjust'] },
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
        <div style={styles.brand}>
          <div style={styles.logo}>
            corp<span style={{ color: 'var(--accent)' }}>sol</span>
          </div>
          <div style={styles.tagline}>Панель руководителя</div>
        </div>

        <nav style={styles.nav}>
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
              >
                {SECTION_ICONS[item.key]}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={styles.footer}>
          <Notifications />
          <div style={styles.user}>
            <div style={styles.avatar}>{session.email.slice(0, 1).toUpperCase()}</div>
            <div style={styles.userText}>
              <div style={styles.userName}>{session.email}</div>
              <div style={styles.userRole}>{ROLE_LABELS[session.role]}</div>
            </div>
            <button style={styles.signOut} onClick={signOut} aria-label="Выйти" title="Выйти">
              <ExitIcon />
            </button>
          </div>
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
  layout: { display: 'flex', minHeight: '100vh', gap: 8, padding: 12 },
  // Меню — отдельной плавающей панелью: так оно не сливается с экраном.
  sidebar: {
    width: 260,
    flexShrink: 0,
    position: 'sticky',
    top: 12,
    height: 'calc(100vh - 24px)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 22,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  brand: { padding: '6px 8px 0' },
  logo: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.05em' },
  tagline: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    overflowY: 'auto',
    margin: '0 -4px',
    padding: '0 4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 12,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    padding: '9px 12px',
    textAlign: 'left',
  },
  navItemActive: {
    background: 'var(--accent-soft)',
    borderColor: 'rgba(124, 124, 248, 0.35)',
    color: 'var(--text)',
  },
  footer: {
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  user: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 0' },
  avatar: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
  },
  userText: { flex: 1, minWidth: 0 },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userRole: { fontSize: 12, color: 'var(--text-muted)', marginTop: 1 },
  signOut: {
    width: 34,
    height: 34,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  content: { flex: 1, minWidth: 0, padding: '28px 32px', maxWidth: 1240 },
};
