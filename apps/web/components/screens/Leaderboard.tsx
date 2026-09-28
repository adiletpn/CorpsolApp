'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import { currentMonth } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { LeaderboardResult, RankedEntry } from '../../lib/types';
import { Badge, Card, Empty, ErrorText } from '../ui';

const REASON_LABELS: Record<string, string> = {
  CHECK_IN_ON_TIME: 'Приход вовремя',
  LATE_PENALTY: 'Опоздания',
  CALL_QUOTA: 'Норма звонков',
  OFFER_ACCEPTED: 'Принятые сделки',
  PLAN_COMPLETED: 'Выполнение плана',
  STREAK_BONUS: 'Серия без опозданий',
  MANUAL_ADJUSTMENT: 'Ручная корректировка',
};

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
}

function Row({ entry, isSelf }: { entry: RankedEntry; isSelf: boolean }) {
  return (
    <tr style={isSelf ? styles.selfRow : undefined}>
      <td style={{ ...styles.cell, width: 60, fontSize: 18 }}>{medal(entry.rank)}</td>
      <td style={styles.cell}>
        {entry.fullName}
        {isSelf ? <span style={styles.you}> — это вы</span> : null}
      </td>
      <td style={{ ...styles.cell, fontWeight: 700 }}>{entry.points}</td>
      <td style={styles.cell}>
        {entry.pointsBehindLeader === 0 ? (
          <Badge tone="success">лидер</Badge>
        ) : (
          <span style={styles.muted}>−{entry.pointsBehindLeader} до первого</span>
        )}
      </td>
      <td style={styles.cell}>
        {entry.breakdown
          ? Object.entries(entry.breakdown)
              .filter(([, value]) => value !== 0)
              .map(([reason, value]) => `${REASON_LABELS[reason] ?? reason}: ${value}`)
              .join(' · ')
          : '—'}
      </td>
    </tr>
  );
}

export function Leaderboard() {
  const { session } = useSession();
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await request<LeaderboardResult>(
          `/gamification/leaderboard${query({ from: period.from, to: period.to })}`,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить рейтинг');
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1 style={styles.title}>Рейтинг</h1>
      <p style={styles.lead}>
        В рейтинге только игровые очки. Оклады, премии и планы остаются личными
        данными и сюда не попадают.
      </p>

      <Card title={`За период ${period.from} — ${period.to}`}>
        {error ? <ErrorText>{error}</ErrorText> : null}

        {!data ? (
          <Empty>Загрузка…</Empty>
        ) : data.entries.length === 0 ? (
          <Empty>Очки за этот период ещё не начислялись</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Место</th>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Очки</th>
                <th style={styles.head}>Отрыв</th>
                <th style={styles.head}>За что начислено</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <Row
                  key={entry.userId}
                  entry={entry}
                  isSelf={entry.userId === session?.id}
                />
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
    maxWidth: 640,
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
  cell: { padding: '10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  selfRow: { background: 'var(--surface-muted)' },
  you: { color: 'var(--accent)', fontSize: 12 },
  muted: { color: 'var(--text-muted)', fontSize: 13 },
};
