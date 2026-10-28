'use client';

import React, { useState } from 'react';

import { request } from '../lib/api';
import { formatMoney } from '../lib/period';
import { Button, ErrorText, Input, Select } from './ui';

export interface PayrollAdjustment {
  id: string;
  userId: string;
  periodStart: string;
  amountMinor: number;
  reason: string;
}

/**
 * Ручные правки листа: доплата или удержание с причиной. Причина
 * обязательна — она же строка в расшифровке, которую увидит сотрудник.
 * Утверждённый лист сервер править не даст.
 */
export function PayrollAdjustments({
  userId,
  periodStart,
  adjustments,
  onChanged,
}: {
  userId: string;
  periodStart: string;
  adjustments: PayrollAdjustment[];
  onChanged(): Promise<void>;
}) {
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const tenge = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(tenge) || tenge <= 0) {
      setError('Сумма — положительное число в тенге');
      return;
    }
    void run(async () => {
      await request('/payroll/adjustments', {
        method: 'POST',
        body: {
          userId,
          periodStart,
          amountMinor: Math.round(tenge * 100) * (sign === '-' ? -1 : 1),
          reason: reason.trim(),
        },
      });
      setAmount('');
      setReason('');
    });
  };

  const remove = (adjustment: PayrollAdjustment) => {
    if (!confirm(`Снять правку «${adjustment.reason}»?`)) return;
    void run(() => request(`/payroll/adjustments/${adjustment.id}`, { method: 'DELETE' }).then(() => undefined));
  };

  return (
    <div style={styles.box}>
      <strong style={styles.heading}>Ручные правки</strong>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {adjustments.length > 0 ? (
        <ul style={styles.list}>
          {adjustments.map((adjustment) => (
            <li key={adjustment.id} style={styles.item}>
              <span>
                {adjustment.reason}:{' '}
                <strong style={{ color: adjustment.amountMinor >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {adjustment.amountMinor >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(adjustment.amountMinor))}
                </strong>
              </span>
              <Button variant="ghost" onClick={() => remove(adjustment)} disabled={busy}>
                Снять
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={add} style={styles.form}>
        <Select aria-label="Доплата или удержание" value={sign} onChange={(event) => setSign(event.target.value as '+' | '-')}>
          <option value="+">Доплата</option>
          <option value="-">Удержание</option>
        </Select>
        <Input
          aria-label="Сумма, ₸"
          placeholder="Сумма, ₸"
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          style={styles.amount}
        />
        <Input
          aria-label="Причина"
          placeholder="Причина — её увидит сотрудник"
          required
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={styles.reason}
        />
        <Button type="submit" disabled={busy}>
          Добавить
        </Button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: { marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' },
  heading: { fontSize: 14 },
  list: { margin: '8px 0', paddingLeft: 0, listStyle: 'none', fontSize: 14 },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  amount: { width: 140 },
  reason: { flex: 1, minWidth: 200 },
};
