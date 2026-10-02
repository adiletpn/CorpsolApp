'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import { currentMonth, formatDuration, formatPhone } from '../../lib/period';
import type { Call, CallSummary, Employee } from '../../lib/types';
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const range = query({ from: period.from, to: period.to });
      const [result, list, staff] = await Promise.all([
        request<CallSummary>(`/calls/summary${range}`),
        request<Call[]>(`/calls${range}`),
        request<Employee[]>('/employees'),
      ]);

      setSummary(result);
      setCalls(list);
      setEmployees(staff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить звонки');
    } finally {
      // Иначе пустая таблица до ответа сервера читается как «звонков нет».
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Звонки приходят с идентификатором сотрудника: Firestore не умеет join,
  // а в таблице нужно имя.
  const employeeName = (userId: string): string =>
    employees.find((employee) => employee.id === userId)?.fullName ?? 'Сотрудник удалён';

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
        {loading ? (
          <Empty>Загружаем…</Empty>
        ) : calls.length === 0 ? (
          <Empty>За выбранный период звонков нет</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Дата</th>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Клиент</th>
                <th style={styles.head}>Направление</th>
                <th style={styles.head}>Разговор</th>
                <th style={styles.head}>Итог</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td style={styles.cell}>{call.callDate}</td>
                  <td style={styles.cell}>{employeeName(call.userId)}</td>
                  <td style={styles.cell}>{formatPhone(call.clientPhone)}</td>
                  <td style={styles.cell}>{DIRECTION_LABELS[call.direction]}</td>
                  <td style={styles.cell}>{formatDuration(call.talkSeconds)}</td>
                  <td style={styles.cell}>
                    <Badge tone={STATUS_TONES[call.status]}>
                      {STATUS_LABELS[call.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  period: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  head: {
    textAlign: 'left',
    padding: '8px 10px',
    color: 'var(--text-muted)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border)',
  },
  cell: { padding: '10px', borderBottom: '1px solid var(--border)' },
};
