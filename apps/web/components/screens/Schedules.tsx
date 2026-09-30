'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { request } from '../../lib/api';
import { useSession } from '../../lib/session';
import type { Department, Employee, Schedule } from '../../lib/types';
import { Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

const WEEKDAYS = [
  { value: 1, short: 'Пн' },
  { value: 2, short: 'Вт' },
  { value: 3, short: 'Ср' },
  { value: 4, short: 'Чт' },
  { value: 5, short: 'Пт' },
  { value: 6, short: 'Сб' },
  { value: 7, short: 'Вс' },
];

function describeWorkdays(days: number[]): string {
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.short)
    .join(', ');
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
  const [scope, setScope] = useState<'DEPARTMENT' | 'USER'>('DEPARTMENT');
  const [ownerId, setOwnerId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [graceMinutes, setGraceMinutes] = useState('5');
  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleDay = (day: number) => {
    setWorkdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await request('/schedules', {
        method: 'POST',
        body: {
          // График принадлежит либо отделу, либо сотруднику, но не обоим.
          departmentId: scope === 'DEPARTMENT' ? ownerId : undefined,
          userId: scope === 'USER' ? ownerId : undefined,
          startTime,
          endTime,
          graceMinutes: Number(graceMinutes),
          workdays,
        },
      });

      setOwnerId('');
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать график');
    } finally {
      setBusy(false);
    }
  };

  const owners = scope === 'DEPARTMENT' ? departments : employees;

  return (
    <form onSubmit={submit}>
      <div style={styles.formGrid}>
        <Field label="Кому">
          <Select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as 'DEPARTMENT' | 'USER');
              setOwnerId('');
            }}
          >
            <option value="DEPARTMENT">Отделу</option>
            <option value="USER">Сотруднику</option>
          </Select>
        </Field>

        <Field
          label={scope === 'DEPARTMENT' ? 'Отдел' : 'Сотрудник'}
          hint={scope === 'USER' ? 'Личный график перебивает график отдела.' : undefined}
        >
          <Select required value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">Выберите</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {'name' in owner ? owner.name : owner.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Начало смены">
          <Input
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </Field>

        <Field label="Конец смены" hint="Смены через полночь пока не поддерживаются.">
          <Input
            type="time"
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </Field>

        <Field
          label="Допуск на опоздание, мин"
          hint="В пределах допуска приход считается вовремя. Не больше 60."
        >
          <Input
            type="number"
            min={0}
            max={60}
            value={graceMinutes}
            onChange={(event) => setGraceMinutes(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Рабочие дни">
        <div style={styles.days}>
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              style={{
                ...styles.day,
                ...(workdays.includes(day.value) ? styles.dayActive : {}),
              }}
            >
              {day.short}
            </button>
          ))}
        </div>
      </Field>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button type="submit" disabled={busy || !ownerId || workdays.length === 0}>
        {busy ? 'Создаём…' : 'Добавить график'}
      </Button>
    </form>
  );
}

export function Schedules() {
  const { can } = useSession();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canManage = can('settings.manage');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, departmentList, employeeList] = await Promise.all([
        request<Schedule[]>('/schedules'),
        request<Department[]>('/departments'),
        request<Employee[]>('/employees'),
      ]);

      setSchedules(list);
      setDepartments(departmentList);
      setEmployees(employeeList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить графики');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (schedule: Schedule) => {
    if (!confirm(`Удалить график «${schedule.ownerName}»?`)) return;

    try {
      await request(`/schedules/${schedule.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить график');
    }
  };

  return (
    <>
      <h1 style={styles.title}>Графики смен</h1>
      <p style={styles.lead}>
        По графику считается опоздание. Без него приход фиксируется, но
        опозданием не считается никогда.
      </p>

      <Card title="Действующие графики">
        {error ? <ErrorText>{error}</ErrorText> : null}

        {schedules.length === 0 ? (
          <Empty>Графики не заведены — опоздания не считаются</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Кому</th>
                <th style={styles.head}>Смена</th>
                <th style={styles.head}>Допуск</th>
                <th style={styles.head}>Дни</th>
                {canManage ? <th style={styles.head} /> : null}
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td style={styles.cell}>
                    <div>{schedule.ownerName}</div>
                    <div style={styles.muted}>
                      {schedule.userId ? 'личный' : 'отдел'}
                    </div>
                  </td>
                  <td style={styles.cell}>
                    {schedule.startTime} — {schedule.endTime}
                  </td>
                  <td style={styles.cell}>{schedule.graceMinutes} мин</td>
                  <td style={styles.cell}>{describeWorkdays(schedule.workdays)}</td>
                  {canManage ? (
                    <td style={styles.cell}>
                      <Button variant="ghost" onClick={() => remove(schedule)}>
                        Удалить
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {canManage ? (
        <Card title="Новый график">
          <CreateForm departments={departments} employees={employees} onCreated={load} />
        </Card>
      ) : null}
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
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0 16px',
  },
  days: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  day: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '8px 14px',
  },
  dayActive: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'var(--background)',
    fontWeight: 600,
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
