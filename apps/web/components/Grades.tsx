'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { GradeTier } from '@corpsol/shared';

import { request } from '../lib/api';
import { formatMoney } from '../lib/period';
import type { Employee } from '../lib/types';
import { Badge, Button, Card, ErrorText, Input, Select } from './ui';

/** Колонки таблицы: деньги вводятся в тенге, хранятся в тиынах. */
const COLUMNS: Array<{ key: keyof GradeTier; label: string; money?: boolean }> = [
  { key: 'baseSalaryMinor', label: 'Оклад', money: true },
  { key: 'monthPlan', label: 'План в месяц' },
  { key: 'weekPlan', label: 'План в неделю' },
  { key: 'rateUnderMinor', label: 'Ниже плана', money: true },
  { key: 'ratePlanMinor', label: 'В план', money: true },
  { key: 'rateOverMinor', label: 'Сверх плана', money: true },
];

/** Ранги получают те, кто делает регистрации, — менеджеры отдела продаж. */
const GRADED_ROLES = ['MOP'];

/**
 * Ранги: таблица «Новая система» и ранг каждого менеджера.
 *
 * Ставки — за регистрацию, по неделе: ниже плана, ровно план, сверх.
 * Ранг на следующий месяц выставляется сам по итогу текущего, здесь —
 * чтобы поправить таблицу или перевести человека руками.
 */
export function Grades({ employees, onChanged }: { employees: Employee[]; onChanged(): Promise<void> }) {
  const [tiers, setTiers] = useState<GradeTier[]>([]);
  const [draft, setDraft] = useState<GradeTier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTiers(await request<GradeTier[]>('/payroll/grades'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить ранги');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const edit = (index: number, key: keyof GradeTier, raw: string, money?: boolean) =>
    setDraft((current) =>
      (current ?? tiers).map((tier, position) =>
        position === index ? { ...tier, [key]: Math.round(Number(raw || 0) * (money ? 100 : 1)) } : tier,
      ),
    );

  const save = () =>
    run(async () => {
      setTiers(await request<GradeTier[]>('/payroll/grades', { method: 'PUT', body: { tiers: draft } }));
      setDraft(null);
    });

  const assign = (userId: string, code: string) =>
    run(async () => {
      await request('/payroll/grades/assign', { method: 'POST', body: { userId, code } });
      await onChanged();
    });

  const shown = draft ?? tiers;
  const managers = employees.filter((employee) => employee.status === 'ACTIVE' && GRADED_ROLES.includes(employee.role));

  return (
    <Card title="Ранги">
      {error ? <ErrorText>{error}</ErrorText> : null}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.head}>Ранг</th>
            {COLUMNS.map((column) => (
              <th key={column.key} style={styles.head}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((tier, index) => (
            <tr key={tier.code}>
              <td style={styles.cell}>
                <strong>{tier.name}</strong>
              </td>
              {COLUMNS.map((column) => (
                <td key={column.key} style={styles.cell}>
                  {draft ? (
                    <Input
                      aria-label={`${tier.name}: ${column.label}`}
                      type="number"
                      min={0}
                      value={String((tier[column.key] as number) / (column.money ? 100 : 1))}
                      onChange={(event) => edit(index, column.key, event.target.value, column.money)}
                      style={styles.number}
                    />
                  ) : column.money ? (
                    formatMoney(tier[column.key] as number)
                  ) : (
                    tier[column.key]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p style={styles.muted}>
        Ставка — за каждую регистрацию недели. Ранг на следующий месяц ставится сам по итогу
        месяца: кто закрыл месячный план ранга — получает его.
      </p>

      <div style={styles.actions}>
        {draft ? (
          <>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить таблицу'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Отмена
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setDraft(tiers)} disabled={tiers.length === 0}>
            Изменить таблицу
          </Button>
        )}
      </div>

      {managers.length > 0 ? (
        <table style={{ ...styles.table, marginTop: 20 }}>
          <thead>
            <tr>
              <th style={styles.head}>Менеджер</th>
              <th style={styles.head}>Ранг</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((employee) => (
              <tr key={employee.id}>
                <td style={styles.cell}>{employee.fullName}</td>
                <td style={styles.cell}>
                  <Select
                    aria-label={`Ранг: ${employee.fullName}`}
                    value={employee.gradeCode ?? ''}
                    disabled={busy}
                    onChange={(event) => void assign(employee.id, event.target.value)}
                  >
                    {/* Вернуть на старую схему отсюда нельзя — только перевести. */}
                    {employee.gradeCode ? null : (
                      <option value="" disabled>
                        без ранга — оклад и правила
                      </option>
                    )}
                    {tiers.map((tier) => (
                      <option key={tier.code} value={tier.code}>
                        {tier.name} · {formatMoney(tier.baseSalaryMinor)}
                      </option>
                    ))}
                  </Select>
                  {employee.gradeCode ? null : <Badge>старая схема</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  number: { width: 110 },
  muted: { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 },
  actions: { display: 'flex', gap: 8 },
};
