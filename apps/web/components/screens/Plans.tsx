'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PLAN_METRIC_LABELS, PLAN_METRICS, type PlanMetric } from '@corpsol/shared';

import { query, request } from '../../lib/api';
import { currentMonth, formatMoney } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { Department, Employee, Plan } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

/** Выручка задаётся в тенге, остальные метрики — в штуках или минутах. */
function isMoneyMetric(metric: PlanMetric): boolean {
  return metric === 'REVENUE';
}

function formatTarget(metric: PlanMetric, value: number): string {
  return isMoneyMetric(metric) ? formatMoney(value) : String(value);
}

function ProgressBar({ ratio }: { ratio: number }) {
  const percent = Math.round(ratio * 100);
  const tone =
    percent >= 100 ? 'var(--success)' : percent >= 70 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={styles.bar}>
      <div
        style={{
          ...styles.barFill,
          // Полосу обрезаем на сотне, а подпись показывает настоящий процент:
          // перевыполнение не должно вылезать за пределы плашки.
          width: `${Math.min(100, percent)}%`,
          background: tone,
        }}
      />
      <span style={styles.barLabel}>{percent}%</span>
    </div>
  );
}

function CreateForm({
  departments,
  employees,
  onCreated,
}: {
  departments: Department[];
  employees: Employee[];
  onCreated: () => void;
}) {
  const period = currentMonth();
  const [form, setForm] = useState({
    scope: 'DEPARTMENT' as 'DEPARTMENT' | 'USER',
    ownerId: '',
    metric: 'CALLS' as PlanMetric,
    target: '',
    periodStart: period.from,
    periodEnd: period.to,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const owners = form.scope === 'DEPARTMENT' ? departments : employees;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await request('/plans', {
        method: 'POST',
        body: {
          scope: form.scope,
          ownerId: form.ownerId,
          metric: form.metric,
          target: isMoneyMetric(form.metric)
            ? Math.round(Number(form.target) * 100)
            : Number(form.target),
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
        },
      });

      setForm({ ...form, target: '' });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось поставить план');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={styles.formGrid}>
        <Field label="Кому">
          <Select
            value={form.scope}
            onChange={(event) =>
              setForm({
                ...form,
                scope: event.target.value as 'DEPARTMENT' | 'USER',
                ownerId: '',
              })
            }
          >
            <option value="DEPARTMENT">Отделу</option>
            <option value="USER">Сотруднику</option>
          </Select>
        </Field>

        <Field label={form.scope === 'DEPARTMENT' ? 'Отдел' : 'Сотрудник'}>
          <Select
            required
            value={form.ownerId}
            onChange={(event) => setForm({ ...form, ownerId: event.target.value })}
          >
            <option value="">Выберите</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {'name' in owner ? owner.name : owner.fullName}
              </option>
            ))}
          </Select>
        </Field>

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

        <Field label={isMoneyMetric(form.metric) ? 'Цель, ₸' : 'Цель'}>
          <Input
            type="number"
            min={0}
            required
            value={form.target}
            onChange={(event) => setForm({ ...form, target: event.target.value })}
          />
        </Field>

        <Field label="Начало периода">
          <Input
            type="date"
            required
            value={form.periodStart}
            onChange={(event) => setForm({ ...form, periodStart: event.target.value })}
          />
        </Field>

        <Field label="Конец периода">
          <Input
            type="date"
            required
            value={form.periodEnd}
            onChange={(event) => setForm({ ...form, periodEnd: event.target.value })}
          />
        </Field>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button type="submit" disabled={busy || !form.ownerId}>
        {busy ? 'Ставим…' : 'Поставить план'}
      </Button>
    </form>
  );
}

export function Plans() {
  const { can } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canManage = can('plan.manage');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [planList, departmentList] = await Promise.all([
        request<Plan[]>(`/plans${query({ periodStart: currentMonth().from })}`),
        request<Department[]>('/departments'),
      ]);

      setPlans(planList);
      setDepartments(departmentList);

      if (canManage) {
        setEmployees(await request<Employee[]>('/employees'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить планы');
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerName = (plan: Plan): string => {
    if (plan.scope === 'DEPARTMENT') {
      return departments.find((item) => item.id === plan.ownerId)?.name ?? 'Отдел';
    }
    return employees.find((item) => item.id === plan.ownerId)?.fullName ?? 'Сотрудник';
  };

  return (
    <>
      <h1 style={styles.title}>Планы</h1>

      <Card title={`Текущий месяц`}>
        {error ? <ErrorText>{error}</ErrorText> : null}

        {plans.length === 0 ? (
          <Empty>Планы на этот период не поставлены</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Кому</th>
                <th style={styles.head}>Метрика</th>
                <th style={styles.head}>Цель</th>
                <th style={styles.head}>Сделано</th>
                <th style={styles.head}>Выполнение</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td style={styles.cell}>
                    <div>{ownerName(plan)}</div>
                    <div style={styles.muted}>
                      {plan.scope === 'DEPARTMENT' ? 'отдел' : 'личный'}
                    </div>
                  </td>
                  <td style={styles.cell}>{PLAN_METRIC_LABELS[plan.metric]}</td>
                  <td style={styles.cell}>{formatTarget(plan.metric, plan.progress.target)}</td>
                  <td style={styles.cell}>
                    {formatTarget(plan.metric, plan.progress.achieved)}
                  </td>
                  <td style={{ ...styles.cell, minWidth: 180 }}>
                    <ProgressBar ratio={plan.progress.ratio} />
                    {plan.progress.isComplete ? (
                      <Badge tone="success">закрыт</Badge>
                    ) : (
                      <span style={styles.muted}>
                        осталось {formatTarget(plan.metric, plan.progress.remaining)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {canManage ? (
        <Card title="Новый план">
          <CreateForm departments={departments} employees={employees} onCreated={load} />
        </Card>
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
  muted: { color: 'var(--text-muted)', fontSize: 12, marginTop: 2 },
  bar: {
    position: 'relative',
    background: 'var(--surface-muted)',
    borderRadius: 999,
    height: 20,
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: { height: '100%', borderRadius: 999 },
  barLabel: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
  },
};
