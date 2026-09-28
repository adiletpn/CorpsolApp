'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ratePercent } from '@corpsol/shared';

import { query, request } from '../../lib/api';
import { currentMonth, formatMoney, formatPercent } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { CompanyStats, DepartmentStats, RiskFlag } from '../../lib/types';
import { Badge, Card, Empty, ErrorText } from '../ui';

function Risks({ risks }: { risks: RiskFlag[] }) {
  if (risks.length === 0) return <Badge tone="success">Без замечаний</Badge>;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {risks.map((risk) => (
        <Badge key={risk.code} tone={risk.severity === 'critical' ? 'danger' : 'warning'}>
          {risk.message}
        </Badge>
      ))}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {hint ? <div style={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

function DepartmentRow({ department }: { department: DepartmentStats }) {
  return (
    <tr>
      <td style={styles.cell}>{department.name}</td>
      <td style={styles.cell}>{department.headcount}</td>
      <td style={styles.cell}>{formatPercent(department.rates.attendanceRate)}</td>
      <td style={styles.cell}>{formatPercent(department.rates.punctualityRate)}</td>
      <td style={styles.cell}>
        {department.planRatio === null ? '—' : `${ratePercent(department.planRatio)}%`}
      </td>
      <td style={styles.cell}>{formatMoney(department.revenueMinor)}</td>
      <td style={styles.cell}>
        <Risks risks={department.risks} />
      </td>
    </tr>
  );
}

export function Overview() {
  const { can } = useSession();
  const [period] = useState(currentMonth);
  const [company, setCompany] = useState<CompanyStats | null>(null);
  const [department, setDepartment] = useState<DepartmentStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (can('analytics.company')) {
        setCompany(
          await request<CompanyStats>(
            `/analytics/company${query({ from: period.from, to: period.to })}`,
          ),
        );
      } else {
        setDepartment(
          await request<DepartmentStats>(
            `/analytics/department${query({ from: period.from, to: period.to })}`,
          ),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить сводку');
    }
  }, [can, period]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card title="Сводка">
        <ErrorText>{error}</ErrorText>
      </Card>
    );
  }

  const stats = company ?? department;
  if (!stats) return <Card title="Сводка">Загрузка…</Card>;

  return (
    <>
      <h1 style={styles.title}>
        {company ? 'Сводка по компании' : `Отдел: ${department?.name}`}
      </h1>
      <p style={styles.period}>
        Период: {period.from} — {period.to}
      </p>

      <Card>
        <div style={styles.statsRow}>
          <Stat
            label="Сотрудников"
            value={String(company ? company.headcount : department?.headcount ?? 0)}
          />
          <Stat
            label="Посещаемость"
            value={formatPercent(stats.rates.attendanceRate)}
            hint="Доля смен, на которые вышли"
          />
          <Stat
            label="Пунктуальность"
            value={formatPercent(stats.rates.punctualityRate)}
            hint="Доля прихода вовремя среди выходов"
          />
          <Stat label="Сделок принято" value={String(stats.acceptedOffers)} />
          <Stat label="Выручка" value={formatMoney(stats.revenueMinor)} />
        </div>
      </Card>

      {company ? (
        <Card title="Отделы">
          {company.departments.length === 0 ? (
            <Empty>Отделы ещё не заведены</Empty>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.head}>Отдел</th>
                  <th style={styles.head}>Людей</th>
                  <th style={styles.head}>Посещаемость</th>
                  <th style={styles.head}>Пунктуальность</th>
                  <th style={styles.head}>План</th>
                  <th style={styles.head}>Выручка</th>
                  <th style={styles.head}>Замечания</th>
                </tr>
              </thead>
              <tbody>
                {company.departments.map((item) => (
                  <DepartmentRow key={item.departmentId} department={item} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {department?.employees ? (
        <Card title="Сотрудники отдела">
          {department.employees.length === 0 ? (
            <Empty>В отделе пока никого нет</Empty>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.head}>Сотрудник</th>
                  <th style={styles.head}>Смен</th>
                  <th style={styles.head}>Пунктуальность</th>
                  <th style={styles.head}>План</th>
                  <th style={styles.head}>Сделок</th>
                  <th style={styles.head}>Замечания</th>
                </tr>
              </thead>
              <tbody>
                {department.employees.map((employee) => (
                  <tr key={employee.userId}>
                    <td style={styles.cell}>{employee.fullName}</td>
                    <td style={styles.cell}>
                      {employee.rates.presentDays} из {employee.rates.expectedDays}
                    </td>
                    <td style={styles.cell}>{formatPercent(employee.rates.punctualityRate)}</td>
                    <td style={styles.cell}>
                      {employee.planRatio === null ? '—' : `${ratePercent(employee.planRatio)}%`}
                    </td>
                    <td style={styles.cell}>{employee.acceptedOffers}</td>
                    <td style={styles.cell}>
                      <Risks risks={employee.risks} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  period: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' },
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
  statHint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  head: {
    textAlign: 'left',
    padding: '8px 10px',
    color: 'var(--text-muted)',
    fontWeight: 500,
    fontSize: 13,
    borderBottom: '1px solid var(--border)',
  },
  cell: { padding: '10px', borderBottom: '1px solid var(--border)' },
};
