'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { query, request } from '../../lib/api';
import type { Department, Employee, Office, Terminal } from '../../lib/types';
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

interface IssuedToken {
  terminalId: string;
  token: string;
}

function OfficeForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    radiusMeters: '120',
    wifiBssids: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await request('/offices', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          address: form.address.trim() || undefined,
          lat: Number(form.lat),
          lng: Number(form.lng),
          radiusMeters: Number(form.radiusMeters),
          wifiBssids: form.wifiBssids
            .split(/[\s,;]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
      });

      setForm({ ...form, name: '', address: '', lat: '', lng: '', wifiBssids: '' });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать офис');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={styles.formGrid}>
        <Field label="Название">
          <Input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field label="Адрес">
          <Input
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </Field>

        <Field label="Широта">
          <Input
            required
            value={form.lat}
            onChange={(event) => setForm({ ...form, lat: event.target.value })}
          />
        </Field>

        <Field label="Долгота">
          <Input
            required
            value={form.lng}
            onChange={(event) => setForm({ ...form, lng: event.target.value })}
          />
        </Field>

        <Field
          label="Радиус, м"
          hint="Меньше 50 м не поставить: GPS в помещении ошибается на 20–50 м, и отметку не засчитало бы никому."
        >
          <Input
            type="number"
            min={50}
            max={1000}
            required
            value={form.radiusMeters}
            onChange={(event) => setForm({ ...form, radiusMeters: event.target.value })}
          />
        </Field>

        <Field
          label="Wi-Fi офиса"
          hint="MAC-адреса точек доступа через запятую. Пусто — проверка по Wi-Fi отключена, работает только GPS."
        >
          <Input
            value={form.wifiBssids}
            onChange={(event) => setForm({ ...form, wifiBssids: event.target.value })}
          />
        </Field>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Создаём…' : 'Добавить офис'}
      </Button>
    </form>
  );
}

export function Settings() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rops, setRops] = useState<Employee[]>([]);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [terminalForm, setTerminalForm] = useState({ name: '', officeId: '' });
  const [departmentForm, setDepartmentForm] = useState({ name: '', headId: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [officeList, terminalList, departmentList, employees] = await Promise.all([
        request<Office[]>('/offices'),
        request<Terminal[]>('/terminals'),
        request<Department[]>('/departments'),
        request<Employee[]>('/employees'),
      ]);

      setOffices(officeList);
      setTerminals(terminalList);
      setDepartments(departmentList);
      // Руководителем отдела может быть только РОП — остальных не предлагаем.
      setRops(employees.filter((employee) => employee.role === 'ROP'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить настройки');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTerminal = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/terminals', { method: 'POST', body: terminalForm });
      setTerminalForm({ name: '', officeId: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать терминал');
    }
  };

  const createDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/departments', {
        method: 'POST',
        body: {
          name: departmentForm.name.trim(),
          headId: departmentForm.headId || undefined,
        },
      });
      setDepartmentForm({ name: '', headId: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать отдел');
    }
  };

  const issueToken = async (terminal: Terminal) => {
    try {
      const result = await request<{ token: string }>(
        `/attendance/terminal/${terminal.id}/access-token`,
        { method: 'POST', body: {} },
      );
      setIssued({ terminalId: terminal.id, token: result.token });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выпустить токен');
    }
  };

  const terminalUrl = (terminalId: string, token: string): string =>
    `${window.location.origin}/terminal/${terminalId}${query({ token })}`;

  return (
    <>
      <h1 style={styles.title}>Настройки</h1>

      {error ? <ErrorText>{error}</ErrorText> : null}

      {issued ? (
        <Card title="Ссылка для экрана терминала">
          <p style={styles.note}>
            Откройте её на мониторе в офисе и оставьте. Токен показывается{' '}
            <strong>один раз</strong>; при повторном выпуске прежняя ссылка перестанет работать.
          </p>
          <div style={styles.token}>{terminalUrl(issued.terminalId, issued.token)}</div>
          <Button variant="ghost" onClick={() => setIssued(null)}>
            Скрыть
          </Button>
        </Card>
      ) : null}

      <Card title="Офисы">
        {offices.length === 0 ? (
          <Empty>Офисы не заведены</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Офис</th>
                <th style={styles.head}>Координаты</th>
                <th style={styles.head}>Радиус</th>
                <th style={styles.head}>Wi-Fi</th>
              </tr>
            </thead>
            <tbody>
              {offices.map((office) => (
                <tr key={office.id}>
                  <td style={styles.cell}>
                    <div>{office.name}</div>
                    <div style={styles.muted}>{office.address ?? '—'}</div>
                  </td>
                  <td style={styles.cell}>
                    {office.lat.toFixed(5)}, {office.lng.toFixed(5)}
                  </td>
                  <td style={styles.cell}>{office.radiusMeters} м</td>
                  <td style={styles.cell}>
                    {office.wifiBssids.length === 0 ? (
                      <Badge>только GPS</Badge>
                    ) : (
                      <Badge tone="success">{office.wifiBssids.length} сет.</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Новый офис">
        <OfficeForm onCreated={load} />
      </Card>

      <Card title="Терминалы">
        {terminals.length === 0 ? (
          <Empty>Терминалы не заведены — сканировать нечего</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Терминал</th>
                <th style={styles.head}>Офис</th>
                <th style={styles.head}>Состояние</th>
                <th style={styles.head} />
              </tr>
            </thead>
            <tbody>
              {terminals.map((terminal) => (
                <tr key={terminal.id}>
                  <td style={styles.cell}>{terminal.name}</td>
                  <td style={styles.cell}>
                    {offices.find((office) => office.id === terminal.officeId)?.name ?? '—'}
                  </td>
                  <td style={styles.cell}>
                    {terminal.isActive ? (
                      <Badge tone="success">Активен</Badge>
                    ) : (
                      <Badge tone="danger">Отключён</Badge>
                    )}{' '}
                    {terminal.hasAccessToken ? <Badge>токен выпущен</Badge> : null}
                  </td>
                  <td style={styles.cell}>
                    <Button variant="ghost" onClick={() => issueToken(terminal)}>
                      {terminal.hasAccessToken ? 'Перевыпустить токен' : 'Выпустить токен'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={createTerminal} style={{ marginTop: 20 }}>
          <div style={styles.formGrid}>
            <Field label="Название терминала">
              <Input
                required
                value={terminalForm.name}
                onChange={(event) =>
                  setTerminalForm({ ...terminalForm, name: event.target.value })
                }
              />
            </Field>

            <Field label="Офис">
              <Select
                required
                value={terminalForm.officeId}
                onChange={(event) =>
                  setTerminalForm({ ...terminalForm, officeId: event.target.value })
                }
              >
                <option value="">Выберите офис</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button type="submit" disabled={!terminalForm.officeId}>
            Добавить терминал
          </Button>
        </form>
      </Card>

      <Card title="Отделы">
        {departments.length === 0 ? (
          <Empty>Отделы не заведены</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Отдел</th>
                <th style={styles.head}>Руководитель</th>
                <th style={styles.head}>Людей</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id}>
                  <td style={styles.cell}>{department.name}</td>
                  <td style={styles.cell}>{department.head?.fullName ?? '—'}</td>
                  <td style={styles.cell}>{department.memberCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={createDepartment} style={{ marginTop: 20 }}>
          <div style={styles.formGrid}>
            <Field label="Название отдела">
              <Input
                required
                value={departmentForm.name}
                onChange={(event) =>
                  setDepartmentForm({ ...departmentForm, name: event.target.value })
                }
              />
            </Field>

            <Field label="Руководитель" hint="Только сотрудник с ролью РОП.">
              <Select
                value={departmentForm.headId}
                onChange={(event) =>
                  setDepartmentForm({ ...departmentForm, headId: event.target.value })
                }
              >
                <option value="">Назначить позже</option>
                {rops.map((rop) => (
                  <option key={rop.id} value={rop.id}>
                    {rop.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button type="submit">Добавить отдел</Button>
        </form>
      </Card>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 24px' },
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
  note: { fontSize: 14, lineHeight: 1.6, margin: 0 },
  token: {
    background: 'var(--surface-muted)',
    borderRadius: 10,
    padding: 14,
    fontFamily: 'monospace',
    fontSize: 13,
    margin: '12px 0',
    wordBreak: 'break-all',
  },
};
