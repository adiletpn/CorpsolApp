'use client';

import React, { useState } from 'react';

import { request } from '../../lib/api';
import { dateKey } from '../../lib/period';
import type { AbsenceRunResult } from '../../lib/types';
import { Button, Card, Field, Input, ErrorText } from '../ui';

/** Вчерашний день: именно за него задача обычно и не отработала. */
function yesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

/**
 * Ручная простановка прогулов.
 *
 * Обычно это делает ночная задача. Экран нужен, когда она не отработала —
 * сервер перезапускали, база была недоступна. Иначе день пришлось бы
 * закрывать правкой по каждому сотруднику отдельно.
 */
export function Absences() {
  const [workDate, setWorkDate] = useState(yesterday());
  const [result, setResult] = useState<AbsenceRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await request<AbsenceRunResult>('/attendance/mark-absences', {
          method: 'POST',
          body: { workDate },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проставить прогулы');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Прогулы</h1>
      <p style={styles.hint}>
        Каждую ночь система сама отмечает тех, кто должен был выйти по графику,
        но не отметился. Здесь можно догнать день, за который задача не отработала.
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card title="Проставить за день">
        <div style={styles.row}>
          <Field label="День">
            <Input
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          </Field>
        </div>

        <Button onClick={() => void run()} disabled={busy || !workDate}>
          {busy ? 'Считаем…' : 'Проставить'}
        </Button>

        {result ? (
          <p style={styles.result}>
            Должны были выйти: {result.expected}. Прогулов проставлено: {result.marked}.
            {result.marked === 0 ? ' Все дни уже закрыты.' : ''}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  hint: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 },
  row: { maxWidth: 240 },
  result: { marginTop: 16, fontSize: 14, color: 'var(--text-muted)' },
};
