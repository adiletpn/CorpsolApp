'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import { currentMonth } from '../../lib/period';
import type { CallSummary } from '../../lib/types';
import { Card, ErrorText, Stat, StatsRow } from '../ui';

export function Calls() {
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await request<CallSummary>(
        `/calls/summary${query({ from: period.from, to: period.to })}`,
      );
      setSummary(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить звонки');
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={styles.title}>Звонки</h1>
      <p style={styles.period}>
        Период: {period.from} — {period.to}
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <StatsRow>
          <Stat label="Всего звонков" value={String(summary?.total ?? 0)} />
          <Stat
            label="Состоялось"
            value={String(summary?.answered ?? 0)}
            hint="Остальные — сброс, занято или сбой"
          />
          <Stat
            label="Минут разговора"
            value={String(summary?.talkMinutes ?? 0)}
            hint="Без времени ожидания ответа"
          />
        </StatsRow>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  period: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
};
