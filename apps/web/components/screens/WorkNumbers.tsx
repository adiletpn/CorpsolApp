'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { request } from '../../lib/api';
import { formatPhone } from '../../lib/period';
import type { Employee, WorkNumberLink } from '../../lib/types';
import { Button, Card, Empty, ErrorText, Field, Input, Select } from '../ui';

const PROVIDER_LABELS: Record<WorkNumberLink['provider'], string> = {
  KCELL: 'Kcell',
  BITRIX: 'Bitrix24',
};

/**
 * Рабочие номера сотрудников.
 *
 * Номер в карточке — личный, звонят клиентам обычно с другого. Пока номер
 * не закреплён здесь, импорт не знает, чьи это звонки, и они оседают
 * нераспределёнными.
 */
export function WorkNumbers() {
  const [links, setLinks] = useState<WorkNumberLink[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Форма привязки нового номера.
  const [userId, setUserId] = useState('');
  const [workNumber, setWorkNumber] = useState('');
  const [provider, setProvider] = useState<WorkNumberLink['provider']>('KCELL');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, staff] = await Promise.all([
        request<WorkNumberLink[]>('/calls/work-numbers'),
        request<Employee[]>('/employees'),
      ]);

      setLinks(list);
      setEmployees(staff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить номера');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlink = async (item: WorkNumberLink) => {
    // Снятая привязка означает, что новые звонки с этого номера перестанут
    // попадать к сотруднику — спрашиваем, чтобы это не вышло случайно.
    const confirmed = window.confirm(
      `Снять номер ${formatPhone(item.workNumber)} с сотрудника ${item.fullName}?\n\n` +
        'Новые звонки с этого номера перестанут распределяться автоматически.',
    );
    if (!confirmed) return;

    setError(null);
    try {
      const params = new URLSearchParams({
        provider: item.provider,
        workNumber: item.workNumber,
      });
      await request(`/calls/work-numbers?${params}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось снять привязку');
    }
  };

  const link = async () => {
    setSaving(true);
    setError(null);
    try {
      await request('/calls/work-numbers', {
        method: 'POST',
        body: { userId, workNumber, provider },
      });

      // Поле номера очищаем, сотрудника оставляем: обычно ему заводят
      // несколько номеров подряд.
      setWorkNumber('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось закрепить номер');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Рабочие номера</h1>
      <p style={styles.hint}>
        По этим номерам импорт раскладывает звонки из выгрузки оператора по сотрудникам.
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card title="Закрепить номер">
        <div style={styles.form}>
          <Field label="Сотрудник">
            <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">Выберите сотрудника</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Рабочий номер" hint="Можно в любом виде: +7, 8, с пробелами">
            <Input
              value={workNumber}
              onChange={(event) => setWorkNumber(event.target.value)}
              placeholder="+7 707 111 22 33"
            />
          </Field>

          <Field label="Источник">
            <Select
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as WorkNumberLink['provider'])
              }
            >
              <option value="KCELL">Kcell</option>
              <option value="BITRIX">Bitrix24</option>
            </Select>
          </Field>
        </div>

        <Button onClick={() => void link()} disabled={saving || !userId || !workNumber}>
          {saving ? 'Сохраняем…' : 'Закрепить'}
        </Button>
      </Card>

      <Card
        title="Закреплённые номера"
        action={
          links.length > 0 ? (
            <span style={styles.counter}>{links.length}</span>
          ) : null
        }
      >
        {loading ? (
          <Empty>Загружаем…</Empty>
        ) : links.length === 0 ? (
          <Empty>Ни одного номера пока не закреплено</Empty>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.head}>Сотрудник</th>
                <th style={styles.head}>Номер</th>
                <th style={styles.head}>Источник</th>
                <th style={styles.head} />
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td style={styles.cell}>{link.fullName}</td>
                  <td style={styles.cell}>{formatPhone(link.workNumber)}</td>
                  <td style={styles.cell}>{PROVIDER_LABELS[link.provider]}</td>
                  <td style={styles.cell}>
                    <Button variant="ghost" onClick={() => void unlink(link)}>
                      Снять
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 4px' },
  hint: { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 },
  counter: { color: 'var(--text-muted)', fontSize: 14 },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  head: {
    textAlign: 'left',
    padding: '8px 10px',
    color: 'var(--text-muted)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border)',
  },
  cell: { padding: '10px', borderBottom: '1px solid var(--border)' },
};
