'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import { currentMonth, formatMoney } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { Employee, Offer } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorText } from '../ui';

const STATUS_LABELS: Record<Offer['status'], string> = {
  SENT: 'Ждёт решения',
  ACCEPTED: 'Принята',
  REJECTED: 'Отказ',
  EXPIRED: 'Истекла',
};

const STATUS_TONES: Record<Offer['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  SENT: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

export function Offers() {
  const { can } = useSession();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canConfirm = can('offer.confirm');
  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [offerList, employeeList] = await Promise.all([
        request<Offer[]>(`/offers${query({ from: period.from, to: period.to })}`),
        request<Employee[]>('/employees'),
      ]);

      setOffers(offerList);
      setEmployees(employeeList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить сделки');
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (offer: Offer, status: 'ACCEPTED' | 'REJECTED') => {
    setBusyId(offer.id);
    try {
      await request(`/offers/${offer.id}/resolve`, { method: 'POST', body: { status } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обработать сделку');
    } finally {
      setBusyId(null);
    }
  };

  const authorName = (userId: string): string =>
    employees.find((employee) => employee.id === userId)?.fullName ?? 'Сотрудник';

  const pending = offers.filter((offer) => offer.status === 'SENT');
  const accepted = offers.filter((offer) => offer.status === 'ACCEPTED');
  const revenue = accepted.reduce((total, offer) => total + offer.amountMinor, 0);

  return (
    <>
      <h1 style={styles.title}>Сделки</h1>
      <p style={styles.lead}>
        Принятая сделка закрывает план и влияет на премию автора, поэтому
        подтверждает её руководитель, а не тот, кто её завёл.
      </p>

      <Card>
        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <div style={styles.statValue}>{pending.length}</div>
            <div style={styles.statLabel}>Ждут решения</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{accepted.length}</div>
            <div style={styles.statLabel}>Принято за месяц</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{formatMoney(revenue)}</div>
            <div style={styles.statLabel}>Выручка</div>
          </div>
        </div>
      </Card>

      <Card title="Все сделки за месяц">
        {error ? <ErrorText>{error}</ErrorText> : null}

        {offers.length === 0 ? (
          <Empty>Сделок пока нет</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Клиент</th>
                <th style={styles.head}>Менеджер</th>
                <th style={styles.head}>Сумма</th>
                <th style={styles.head}>Отправлена</th>
                <th style={styles.head}>Статус</th>
                {canConfirm ? <th style={styles.head} /> : null}
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td style={styles.cell}>
                    <div>{offer.clientName}</div>
                    {offer.clientPhone ? (
                      <div style={styles.muted}>{offer.clientPhone}</div>
                    ) : null}
                  </td>
                  <td style={styles.cell}>{authorName(offer.userId)}</td>
                  <td style={styles.cell}>{formatMoney(offer.amountMinor)}</td>
                  <td style={styles.cell}>{offer.sentDate}</td>
                  <td style={styles.cell}>
                    <Badge tone={STATUS_TONES[offer.status]}>
                      {STATUS_LABELS[offer.status]}
                    </Badge>
                  </td>
                  {canConfirm ? (
                    <td style={styles.cell}>
                      {offer.status === 'SENT' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            disabled={busyId === offer.id}
                            onClick={() => resolve(offer, 'ACCEPTED')}
                          >
                            Принята
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busyId === offer.id}
                            onClick={() => resolve(offer, 'REJECTED')}
                          >
                            Отказ
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
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
  statsRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  stat: {
    background: 'var(--surface-muted)',
    borderRadius: 12,
    padding: 16,
    minWidth: 150,
    flex: 1,
  },
  statValue: { fontSize: 26, fontWeight: 700 },
  statLabel: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
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
