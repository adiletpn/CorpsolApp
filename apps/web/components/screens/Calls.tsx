'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import { currentMonth } from '../../lib/period';
import type { Call, CallSummary } from '../../lib/types';
import { Badge, Card, Empty, ErrorText, Stat, StatsRow } from '../ui';

const STATUS_LABELS: Record<Call['status'], string> = {
  ANSWERED: 'Состоялся',
  NO_ANSWER: 'Не ответили',
  BUSY: 'Занято',
  FAILED: 'Сбой',
};

const STATUS_TONES: Record<Call['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  ANSWERED: 'success',
  NO_ANSWER: 'warning',
  BUSY: 'warning',
  FAILED: 'danger',
};

const DIRECTION_LABELS: Record<Call['direction'], string> = {
  INBOUND: 'Входящий',
  OUTBOUND: 'Исходящий',
};

export function Calls() {
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);

  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const range = query({ from: period.from, to: period.to });
      const [result, list] = await Promise.all([
        request<CallSummary>(`/calls/summary${range}`),
        request<Call[]>(`/calls${range}`),
      ]);

      setSummary(result);
      setCalls(list);
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

      <Card title="Журнал звонков">
        {calls.length === 0 ? (
          <Empty>За выбранный период звонков нет</Empty>
        ) : (
          <p style={styles.period}>Загружено звонков: {calls.length}</p>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  period: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
};
