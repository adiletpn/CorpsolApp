'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import type { AuditEvent } from '../../lib/types';
import { Badge, Card, Empty, ErrorText } from '../ui';

const ACTION_LABELS: Record<string, string> = {
  'attendance.adjust': 'Правка табеля',
  'device.unbind': 'Открепление телефона',
  'employee.create': 'Заведён сотрудник',
  'employee.update': 'Изменены данные сотрудника',
  'employee.terminate': 'Увольнение',
  'offer.accepted': 'Сделка подтверждена',
  'offer.rejected': 'Сделка отклонена',
  'offer.expired': 'Сделка истекла',
};

/** Действия, которыми обходят автоматический контроль. */
const SENSITIVE = new Set(['attendance.adjust', 'device.unbind', 'employee.terminate']);

function describe(event: AuditEvent): string {
  const meta = event.metadata ?? {};

  if (event.action === 'attendance.adjust') {
    const previous = meta.previousStatus ? ` (было ${meta.previousStatus})` : '';
    return `за ${meta.workDate}: ${meta.status}${previous} — ${meta.reason}`;
  }
  if (event.action === 'device.unbind') {
    return `устройство ${String(meta.deviceId ?? '').slice(0, 12)}…`;
  }
  if (event.action === 'employee.terminate') {
    return meta.reason ? String(meta.reason) : 'без указания причины';
  }
  if (event.action === 'employee.create') {
    return `роль ${meta.role}`;
  }

  const entries = Object.entries(meta).filter(([, value]) => value !== null);
  return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ');
}

export function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvents(
        await request<AuditEvent[]>(`/audit${query({ limit: 200, sensitiveOnly })}`),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить журнал');
    }
  }, [sensitiveOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1 style={styles.title}>Журнал действий</h1>
      <p style={styles.lead}>
        Система контролирует приход автоматически, но у неё есть ручные обходы:
        правка табеля, открепление телефона, увольнение. Здесь видно, кто ими
        пользовался.
      </p>

      <Card
        title="События"
        action={
          <label style={styles.toggle}>
            <input
              type="checkbox"
              checked={sensitiveOnly}
              onChange={(event) => setSensitiveOnly(event.target.checked)}
            />
            Только обходы контроля
          </label>
        }
      >
        {error ? <ErrorText>{error}</ErrorText> : null}

        {events.length === 0 ? (
          <Empty>{sensitiveOnly ? 'Обходов контроля не было' : 'Журнал пуст'}</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Когда</th>
                <th style={styles.head}>Кто</th>
                <th style={styles.head}>Действие</th>
                <th style={styles.head}>Подробности</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td style={styles.cell}>
                    {new Date(event.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={styles.cell}>{event.actor?.fullName ?? '—'}</td>
                  <td style={styles.cell}>
                    {SENSITIVE.has(event.action) ? (
                      <Badge tone="warning">
                        {ACTION_LABELS[event.action] ?? event.action}
                      </Badge>
                    ) : (
                      (ACTION_LABELS[event.action] ?? event.action)
                    )}
                  </td>
                  <td style={{ ...styles.cell, ...styles.details }}>{describe(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 8px' },
  lead: {
    color: 'var(--text-muted)',
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 680,
    margin: '0 0 24px',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  head: {
    textAlign: 'left',
    padding: '8px 10px',
    color: 'var(--text-muted)',
    fontWeight: 500,
    fontSize: 13,
    borderBottom: '1px solid var(--border)',
  },
  cell: { padding: '10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  details: { color: 'var(--text-muted)', fontSize: 13 },
  toggle: {
    color: 'var(--text-muted)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
};
