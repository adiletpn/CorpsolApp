'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { request } from '../../lib/api';
import type { Achievement } from '../../lib/types';
import { Card, Empty, ErrorText } from '../ui';

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

  return (
    <div>
      <h1 style={styles.title}>Достижения</h1>
      <p style={styles.hint}>Полученные и те, до которых осталось дойти.</p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        {loading ? <Empty>Загружаем…</Empty> : <Empty>{items.length} достижений</Empty>}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  hint: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
};
