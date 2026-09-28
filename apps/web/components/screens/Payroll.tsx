'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PLAN_METRIC_LABELS, PLAN_METRICS, type PlanMetric } from '@corpsol/shared';

import { query, request } from '../../lib/api';
import { currentMonth, formatMoney } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { BonusRule, Employee, Payroll as PayrollDoc } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

const RULE_KINDS = [
  { value: 'PLAN_COMPLETION', label: 'Премия за выполнение плана' },
  { value: 'PER_UNIT', label: 'Оплата за единицу' },
  { value: 'ATTENDANCE', label: 'Премия за пунктуальность' },
  { value: 'LATE_PENALTY', label: 'Удержание за опоздания' },
  { value: 'ABSENCE_PENALTY', label: 'Удержание за прогулы' },
] as const;

type RuleKind = (typeof RULE_KINDS)[number]['value'];

/** Правила, которые без метрики не имеют смысла. */
const NEEDS_METRIC: RuleKind[] = ['PLAN_COMPLETION', 'PER_UNIT'];

function thresholdHint(kind: RuleKind): string {
  switch (kind) {
    case 'PLAN_COMPLETION':
      return 'Процент выполнения, с которого начисляется премия.';
    case 'PER_UNIT':
      return 'Не используется: платится за каждую сделанную единицу.';
    case 'ATTENDANCE':
      return 'Сколько опозданий за период допустимо для премии.';
    case 'LATE_PENALTY':
      return 'Сколько опозданий прощается. Дальше каждое удерживается.';
    case 'ABSENCE_PENALTY':
      return 'Не используется: удерживается за каждый прогул.';
  }
}

function RuleForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    kind: 'PLAN_COMPLETION' as RuleKind,
    metric: 'CALLS' as PlanMetric,
    threshold: '100',
    amount: '',
    percent: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await request('/payroll/rules', {
        method: 'POST',
        body: {
          kind: form.kind,
          metric: NEEDS_METRIC.includes(form.kind) ? form.metric : undefined,
          threshold: Number(form.threshold) || 0,
          amountMinor: form.amount ? Math.round(Number(form.amount) * 100) : 0,
          // Процент вводится как 5, хранится в базисных пунктах: 500.
          percentBps: form.percent ? Math.round(Number(form.percent) * 100) : 0,
        },
      });

      setForm({ ...form, amount: '', percent: '' });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать правило');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={styles.formGrid}>
        <Field label="Тип правила">
          <Select
            value={form.kind}
            onChange={(event) => setForm({ ...form, kind: event.target.value as RuleKind })}
          >
            {RULE_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>

        {NEEDS_METRIC.includes(form.kind) ? (
          <Field label="Метрика">
            <Select
              value={form.metric}
              onChange={(event) => setForm({ ...form, metric: event.target.value as PlanMetric })}
            >
              {PLAN_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {PLAN_METRIC_LABELS[metric]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Порог" hint={thresholdHint(form.kind)}>
          <Input
            type="number"
            min={0}
            value={form.threshold}
            onChange={(event) => setForm({ ...form, threshold: event.target.value })}
          />
        </Field>

        <Field label="Сумма, ₸">
          <Input
            type="number"
            min={0}
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </Field>

        <Field label="Или процент от оклада" hint="Можно задать и сумму, и процент — они сложатся.">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.percent}
            onChange={(event) => setForm({ ...form, percent: event.target.value })}
          />
        </Field>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Создаём…' : 'Добавить правило'}
      </Button>
    </form>
  );
}

export function Payroll() {
  const { can } = useSession();
  const [payrolls, setPayrolls] = useState<PayrollDoc[]>([]);
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can('payroll.manage');
  const period = currentMonth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, employeeList] = await Promise.all([
        request<PayrollDoc[]>(`/payroll${query({ periodStart: period.from })}`),
        request<Employee[]>('/employees'),
      ]);

      setPayrolls(list);
      setEmployees(employeeList);

      if (canManage) setRules(await request<BonusRule[]>('/payroll/rules'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить расчёты');
    }
  }, [canManage, period.from]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Пересчёт по всем сотрудникам: правила могли измениться после прошлого. */
  const recalculateAll = async () => {
    setBusy(true);
    setError(null);

    try {
      const active = employees.filter((employee) => employee.status === 'ACTIVE');

      for (const employee of active) {
        await request('/payroll/calculate', {
          method: 'POST',
          body: { userId: employee.id, periodStart: period.from, periodEnd: period.to },
        });
      }

      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Пересчёт не удался');
    } finally {
      setBusy(false);
    }
  };

  const employeeName = (userId: string): string =>
    employees.find((employee) => employee.id === userId)?.fullName ?? 'Сотрудник';

  return (
    <>
      <h1 style={styles.title}>Зарплата</h1>

      <Card
        title={`Расчёт за ${period.from} — ${period.to}`}
        action={
          canManage ? (
            <Button onClick={recalculateAll} disabled={busy}>
              {busy ? 'Считаем…' : 'Пересчитать всем'}
            </Button>
          ) : null
        }
      >
        {error ? <ErrorText>{error}</ErrorText> : null}

        {payrolls.length === 0 ? (
          <Empty>Расчёт за этот период ещё не выполнялся</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Оклад</th>
                <th style={styles.head}>Премия</th>
                <th style={styles.head}>Удержано</th>
                <th style={styles.head}>К выплате</th>
                <th style={styles.head} />
              </tr>
            </thead>
            <tbody>
              {payrolls.map((payroll) => (
                <React.Fragment key={payroll.id}>
                  <tr>
                    <td style={styles.cell}>{employeeName(payroll.userId)}</td>
                    <td style={styles.cell}>{formatMoney(payroll.baseSalaryMinor)}</td>
                    <td style={{ ...styles.cell, color: 'var(--success)' }}>
                      {payroll.bonusMinor > 0 ? `+${formatMoney(payroll.bonusMinor)}` : '—'}
                    </td>
                    <td style={{ ...styles.cell, color: 'var(--danger)' }}>
                      {payroll.penaltyMinor > 0 ? `−${formatMoney(payroll.penaltyMinor)}` : '—'}
                    </td>
                    <td style={{ ...styles.cell, fontWeight: 700 }}>
                      {formatMoney(payroll.totalMinor)}
                    </td>
                    <td style={styles.cell}>
                      <Button
                        variant="ghost"
                        onClick={() => setExpanded(expanded === payroll.id ? null : payroll.id)}
                      >
                        {expanded === payroll.id ? 'Свернуть' : 'Расшифровка'}
                      </Button>
                    </td>
                  </tr>

                  {expanded === payroll.id ? (
                    <tr>
                      <td style={styles.breakdown} colSpan={6}>
                        {payroll.lines.length === 0 ? (
                          <span style={styles.muted}>
                            Ни одно правило не сработало — выплачивается голый оклад.
                          </span>
                        ) : (
                          <ul style={styles.lines}>
                            {payroll.lines.map((line) => (
                              <li key={`${line.ruleId}-${line.title}`}>
                                {line.title}:{' '}
                                <strong
                                  style={{
                                    color:
                                      line.amountMinor >= 0 ? 'var(--success)' : 'var(--danger)',
                                  }}
                                >
                                  {line.amountMinor >= 0 ? '+' : '−'}
                                  {formatMoney(Math.abs(line.amountMinor))}
                                </strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {canManage ? (
        <>
          <Card title="Правила премирования">
            {rules.length === 0 ? (
              <Empty>
                Правил нет — расчёт выдаёт голый оклад без премий и удержаний
              </Empty>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.head}>Правило</th>
                    <th style={styles.head}>Метрика</th>
                    <th style={styles.head}>Порог</th>
                    <th style={styles.head}>Сумма</th>
                    <th style={styles.head}>Процент</th>
                    <th style={styles.head}>Состояние</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td style={styles.cell}>
                        {RULE_KINDS.find((kind) => kind.value === rule.kind)?.label ?? rule.kind}
                      </td>
                      <td style={styles.cell}>
                        {rule.metric ? PLAN_METRIC_LABELS[rule.metric] : '—'}
                      </td>
                      <td style={styles.cell}>{rule.threshold}</td>
                      <td style={styles.cell}>
                        {rule.amountMinor > 0 ? formatMoney(rule.amountMinor) : '—'}
                      </td>
                      <td style={styles.cell}>
                        {rule.percentBps > 0 ? `${rule.percentBps / 100}%` : '—'}
                      </td>
                      <td style={styles.cell}>
                        {rule.isActive ? (
                          <Badge tone="success">действует</Badge>
                        ) : (
                          <Badge>отключено</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Новое правило">
            <RuleForm onCreated={load} />
          </Card>
        </>
      ) : null}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 24px' },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0 16px',
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
  breakdown: {
    padding: '12px 10px 16px',
    background: 'var(--surface-muted)',
    borderBottom: '1px solid var(--border)',
  },
  lines: { margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14 },
  muted: { color: 'var(--text-muted)', fontSize: 13 },
};
