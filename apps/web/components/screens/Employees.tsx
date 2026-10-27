'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, type Role } from '@corpsol/shared';

import { query, request } from '../../lib/api';
import { formatMoney } from '../../lib/period';
import { useSession } from '../../lib/session';
import type { Department, Employee, Office } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

interface CreatedEmployee extends Employee {
  /** Возвращается один раз при заведении — передаётся сотруднику лично. */
  temporaryPassword: string;
}

function CreateForm({
  departments,
  offices,
  assignableRoles,
  onCreated,
}: {
  departments: Department[];
  offices: Office[];
  assignableRoles: Role[];
  onCreated: (employee: CreatedEmployee) => void;
}) {
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    role: assignableRoles[0] ?? 'MOP',
    departmentId: '',
    officeId: '',
    salary: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const created = await request<CreatedEmployee>('/employees', {
        method: 'POST',
        body: {
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          role: form.role,
          departmentId: form.departmentId || undefined,
          officeId: form.officeId || undefined,
          // Оклад вводится в тенге, а хранится в тиынах.
          baseSalaryMinor: form.salary ? Math.round(Number(form.salary) * 100) : undefined,
        },
      });

      onCreated(created);
      setForm({ ...form, email: '', fullName: '', salary: '' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось завести сотрудника');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={styles.formGrid}>
        <Field label="Рабочий email">
          <Input
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>

        <Field label="Имя и фамилия">
          <Input
            required
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </Field>

        <Field label="Роль">
          <Select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Отдел">
          <Select
            value={form.departmentId}
            onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
          >
            <option value="">Без отдела</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Офис">
          <Select
            value={form.officeId}
            onChange={(event) => setForm({ ...form, officeId: event.target.value })}
          >
            <option value="">Без офиса</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Оклад, ₸">
          <Input
            type="number"
            min={0}
            // Без шага браузер считает дробное значение недопустимым
            // и молча отменяет отправку формы, хотя тиыны мы считаем.
            step="0.01"
            value={form.salary}
            onChange={(event) => setForm({ ...form, salary: event.target.value })}
          />
        </Field>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Заводим…' : 'Завести сотрудника'}
      </Button>
    </form>
  );
}

export function Employees() {
  const { can } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<Role[]>([]);
  const [created, setCreated] = useState<CreatedEmployee | null>(null);
  const [showTerminated, setShowTerminated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = can('employee.create');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, departmentList] = await Promise.all([
        request<Employee[]>(`/employees${query({ includeTerminated: showTerminated })}`),
        request<Department[]>('/departments'),
      ]);

      setEmployees(list);
      setDepartments(departmentList);

      if (canCreate) {
        const [officeList, roles] = await Promise.all([
          request<Office[]>('/offices'),
          request<{ roles: Role[] }>('/employees/assignable-roles'),
        ]);
        setOffices(officeList);
        setAssignableRoles(roles.roles);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить сотрудников');
    }
  }, [canCreate, showTerminated]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Новый пароль показывается в той же карточке, что и при заведении. */
  const resetPassword = async (employee: Employee) => {
    if (!confirm(`Выдать ${employee.fullName} новый пароль? Старый перестанет работать.`)) return;

    try {
      const result = await request<{ temporaryPassword: string }>(
        `/employees/${employee.id}/reset-password`,
        { method: 'POST', body: {} },
      );
      setCreated({ ...employee, temporaryPassword: result.temporaryPassword });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выдать пароль');
    }
  };

  const terminate = async (employee: Employee) => {
    if (!confirm(`Уволить сотрудника ${employee.fullName}? Доступ закроется сразу.`)) return;

    try {
      await request(`/employees/${employee.id}/terminate`, { method: 'POST', body: {} });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось уволить');
    }
  };

  const departmentName = (id: string | null): string =>
    departments.find((department) => department.id === id)?.name ?? '—';

  return (
    <>
      <h1 style={styles.title}>Сотрудники</h1>

      {created ? (
        <Card title="Пароль сотрудника">
          <p style={styles.passwordNote}>
            Передайте временный пароль лично. Он показывается <strong>один раз</strong> —
            после перезагрузки страницы восстановить его будет нельзя.
          </p>
          <div style={styles.password}>{created.temporaryPassword}</div>
          <p style={styles.passwordHint}>
            {created.fullName} · {created.email}
          </p>
          <div style={styles.passwordActions}>
            <CopyButton text={created.temporaryPassword} />
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Скрыть
            </Button>
          </div>
        </Card>
      ) : null}

      {canCreate && assignableRoles.length > 0 ? (
        <Card title="Новый сотрудник">
          <CreateForm
            departments={departments}
            offices={offices}
            assignableRoles={assignableRoles}
            onCreated={(employee) => {
              setCreated(employee);
              void load();
            }}
          />
        </Card>
      ) : null}

      <Card
        title="Штат"
        action={
          <label style={styles.toggle}>
            <input
              type="checkbox"
              checked={showTerminated}
              onChange={(event) => setShowTerminated(event.target.checked)}
            />
            Показывать уволенных
          </label>
        }
      >
        {error ? <ErrorText>{error}</ErrorText> : null}

        {employees.length === 0 ? (
          <Empty>Сотрудники не заведены</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Роль</th>
                <th style={styles.head}>Отдел</th>
                <th style={styles.head}>Оклад</th>
                <th style={styles.head}>Статус</th>
                {canCreate || can('employee.terminate') ? <th style={styles.head} /> : null}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td style={styles.cell}>
                    <div>{employee.fullName}</div>
                    <div style={styles.muted}>{employee.email}</div>
                  </td>
                  <td style={styles.cell}>{ROLE_LABELS[employee.role]}</td>
                  <td style={styles.cell}>{departmentName(employee.departmentId)}</td>
                  <td style={styles.cell}>{formatMoney(employee.baseSalaryMinor)}</td>
                  <td style={styles.cell}>
                    {employee.status === 'ACTIVE' ? (
                      <Badge tone="success">Работает</Badge>
                    ) : (
                      <Badge tone="danger">Уволен</Badge>
                    )}
                  </td>
                  {canCreate || can('employee.terminate') ? (
                    <td style={styles.cell}>
                      {employee.status === 'ACTIVE' ? (
                        <div style={styles.actions}>
                          {canCreate ? (
                            <Button variant="ghost" onClick={() => resetPassword(employee)}>
                              Новый пароль
                            </Button>
                          ) : null}
                          {can('employee.terminate') ? (
                            <Button variant="danger" onClick={() => terminate(employee)}>
                              Уволить
                            </Button>
                          ) : null}
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

/**
 * Пароль переписывали руками — и путали «l» с «1». Копирование убирает
 * опечатку при передаче сотруднику.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена закрыт браузером — пароль по-прежнему виден на экране.
    }
  };

  return <Button onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</Button>;
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 24px' },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  passwordActions: { display: 'flex', gap: 8 },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
  toggle: {
    color: 'var(--text-muted)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  password: {
    background: 'var(--surface-muted)',
    borderRadius: 10,
    padding: 16,
    fontFamily: 'monospace',
    fontSize: 20,
    letterSpacing: 1,
    margin: '12px 0',
  },
  passwordNote: { fontSize: 14, lineHeight: 1.6, margin: 0 },
  passwordHint: { color: 'var(--text-muted)', fontSize: 13, margin: '0 0 12px' },
};
