'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { request } from '../../lib/api';
import type { Achievement } from '../../lib/types';
import { Card, Empty, ErrorText } from '../ui';

/** Дата без времени: час получения ачивки никому не интересен. */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function Achievements() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await request<Achievement[]>('/gamification/achievements'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить ачивки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earned = items.filter((item) => item.unlockedAt !== null);
  const pending = items.filter((item) => item.unlockedAt === null);

  return (
    <div>
      <h1 style={styles.title}>Достижения</h1>
      <p style={styles.hint}>Полученные и те, до которых осталось дойти.</p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card title="Получено" action={<span style={styles.counter}>{earned.length} из {items.length}</span>}>
        {loading ? (
          <Empty>Загружаем…</Empty>
        ) : earned.length === 0 ? (
          <Empty>Пока ни одного — всё впереди</Empty>
        ) : (
          <div style={styles.grid}>
            {earned.map((item) => (
              <div key={item.code} style={styles.earned}>
                <div style={styles.cardTitle}>{item.title}</div>
                <div style={styles.cardText}>{item.description}</div>
                <div style={styles.points}>+{item.points} очков</div>
                <div style={styles.date}>Получено {formatDate(item.unlockedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="К чему стремиться">
        {loading ? (
          <Empty>Загружаем…</Empty>
        ) : pending.length === 0 ? (
          <Empty>Все достижения получены</Empty>
        ) : (
          <div style={styles.grid}>
            {pending.map((item) => (
              <div key={item.code} style={styles.pending}>
                <div style={styles.cardTitle}>{item.title}</div>
                <div style={styles.cardText}>{item.description}</div>
                <div style={styles.pendingPoints}>+{item.points} очков</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  hint: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
  counter: { color: 'var(--text-muted)', fontSize: 14 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  earned: {
    background: 'var(--surface-muted)',
    borderRadius: 12,
    padding: 16,
    borderLeft: '3px solid var(--success)',
  },
  cardTitle: { fontWeight: 600, marginBottom: 4 },
  cardText: { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 },
  points: { marginTop: 10, fontSize: 13, color: 'var(--success)', fontWeight: 600 },
  pending: {
    background: 'var(--surface-muted)',
    borderRadius: 12,
    padding: 16,
    borderLeft: '3px solid var(--border)',
    opacity: 0.75,
  },
  date: { marginTop: 4, fontSize: 12, color: 'var(--text-muted)' },
  pendingPoints: { marginTop: 10, fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 },
};
