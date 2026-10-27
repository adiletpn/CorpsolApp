'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { NOTIFICATION_NEEDS_ACTION, type NotificationKind } from '@corpsol/shared';

import { request } from '../lib/api';

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Как давно: точное время в ленте не нужно, важна свежесть. */
function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'вчера' : `${days} дн назад`;
}

/**
 * Колокольчик с лентой уведомлений.
 *
 * Счётчик обновляется сам: заявка на смену телефона блокирует человеку
 * вход, и узнать о ней через час, перезагрузив страницу, — слишком поздно.
 */
export function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const result = await request<{ count: number }>('/notifications/unread-count');
      setUnread(result.count);
    } catch {
      // Счётчик — не повод показывать ошибку поверх работы.
    }
  }, []);

  useEffect(() => {
    void loadCount();

    // Минута — компромисс: заявку видно почти сразу, а лишних запросов
    // за смену набегает шесть десятков, а не тысячи.
    const timer = setInterval(() => void loadCount(), 60_000);
    return () => clearInterval(timer);
  }, [loadCount]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;

    try {
      setItems(await request<Notification[]>('/notifications'));
    } catch {
      setItems([]);
    }
  };

  const markAllRead = async () => {
    await request('/notifications/read-all', { method: 'POST' });
    setItems((shown) =>
      shown.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  };

  return (
    <div style={styles.wrap}>
      <button style={styles.bell} onClick={() => void toggle()} aria-label="Уведомления">
        Уведомления
        {unread > 0 ? (
          // Больше девяти показываем как «9+»: точное число не меняет
          // решения, а в кружок оно не помещается.
          <span style={styles.badge}>{unread > 9 ? '9+' : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <span>Уведомления</span>
            {unread > 0 ? (
              <button style={styles.link} onClick={() => void markAllRead()}>
                Прочитать всё
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div style={styles.empty}>Пока ничего нет</div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                style={{
                  ...styles.item,
                  ...(item.readAt ? styles.itemRead : {}),
                }}
              >
                <div style={styles.itemTitle}>
                  {NOTIFICATION_NEEDS_ACTION[item.kind as NotificationKind] && !item.readAt ? (
                    <span style={styles.dot} aria-label="Требует действия" />
                  ) : null}
                  {item.title}
                </div>
                <div style={styles.itemBody}>{item.body}</div>
                <div style={styles.itemTime}>{ago(item.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative' },
  bell: {
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 12,
    color: 'var(--text-muted)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '9px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    background: 'var(--danger)',
    color: '#fff',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 6px',
    minWidth: 18,
    textAlign: 'center',
  },
  panel: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    width: 300,
    maxHeight: 380,
    overflowY: 'auto',
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 16,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45)',
    marginBottom: 8,
    zIndex: 10,
  },
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    fontWeight: 600,
  },
  link: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  empty: { padding: 16, color: 'var(--text-muted)', fontSize: 13 },
  item: { padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  itemRead: { opacity: 0.55 },
  itemTitle: { fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: 'var(--danger)',
    display: 'inline-block',
  },
  itemBody: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 },
  itemTime: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
};
