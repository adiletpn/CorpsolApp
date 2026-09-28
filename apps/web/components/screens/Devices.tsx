'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS } from '@corpsol/shared';

import { request } from '../../lib/api';
import type { DeviceRequest } from '../../lib/types';
import { Button, Card, Empty, ErrorText } from '../ui';

function whenCreated(value: DeviceRequest['createdAt']): string {
  const date =
    typeof value === 'string' ? new Date(value) : new Date(value._seconds * 1000);

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Devices() {
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await request<DeviceRequest[]>('/devices/requests'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить заявки');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await request(`/devices/requests/${id}/${action}`, { method: 'POST', body: {} });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обработать заявку');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <h1 style={styles.title}>Привязка устройств</h1>
      <p style={styles.lead}>
        Аккаунт закреплён за одним телефоном. Когда сотрудник меняет устройство,
        заявка попадает сюда. Одобрение открепляет старый телефон и закрепляет новый —
        отметиться с прежнего он больше не сможет.
      </p>

      <Card title="Ожидают решения">
        {error ? <ErrorText>{error}</ErrorText> : null}

        {requests.length === 0 ? (
          <Empty>Новых заявок нет</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Устройство</th>
                <th style={styles.head}>Подана</th>
                <th style={styles.head} />
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id}>
                  <td style={styles.cell}>
                    <div>{item.user.fullName}</div>
                    <div style={styles.muted}>
                      {item.user.email} · {ROLE_LABELS[item.user.role]}
                    </div>
                  </td>
                  <td style={styles.cell}>
                    <div>{item.model ?? 'Модель не определена'}</div>
                    <div style={styles.muted}>{item.platform}</div>
                  </td>
                  <td style={styles.cell}>{whenCreated(item.createdAt)}</td>
                  <td style={styles.cell}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        disabled={busyId === item.id}
                        onClick={() => resolve(item.id, 'approve')}
                      >
                        Одобрить
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busyId === item.id}
                        onClick={() => resolve(item.id, 'reject')}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </td>
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
  muted: { color: 'var(--text-muted)', fontSize: 12, marginTop: 2 },
};
