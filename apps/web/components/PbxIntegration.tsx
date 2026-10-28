'use client';

import React, { useState } from 'react';

import { request } from '../lib/api';
import { Badge, Button, Card, ErrorText, Field, Input } from './ui';

export interface PbxIntegrationState {
  isActive: boolean;
  credentialsMasked: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface PbxSyncResult {
  fetched: number;
  imported: number;
  duplicates: number;
  withoutEmployee: number;
  unmatched: Array<{ employeeKey: string; count: number }>;
}

interface FieldSpec {
  name: string;
  label: string;
  placeholder?: string;
  initial?: string;
  secret?: boolean;
}

/**
 * Карточка АТС: Kcell (API) или Sipuni. Устроены одинаково — подключение
 * формой, затем маска доступа, состояние добора и кнопки. Звонки потом
 * добираются сами каждый час; кнопка — чтобы не ждать.
 */
export function PbxIntegration({
  title,
  name,
  path,
  state,
  fields,
  hint,
  keyLabel,
  onChanged,
}: {
  title: string;
  /** Короткое имя для кнопок: «Подключить Kcell». */
  name: string;
  /** kcell или sipuni — часть адреса /calls/integrations/… */
  path: 'kcell' | 'sipuni';
  state: PbxIntegrationState | undefined;
  fields: FieldSpec[];
  hint: string;
  /** Как называется ключ сотрудника в этой АТС — для подсказки о несопоставленных. */
  keyLabel: string;
  onChanged(): Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.initial ?? ''])),
  );
  const [result, setResult] = useState<PbxSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const body = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
      await request(`/calls/integrations/${path}`, { method: 'POST', body });
      // Секреты не держим в форме дольше нужного.
      setValues(Object.fromEntries(fields.map((field) => [field.name, field.secret ? '' : (field.initial ?? '')])));
      await onChanged();
    });
  };

  const sync = () =>
    run(async () => {
      setResult(await request<PbxSyncResult>(`/calls/integrations/${path}/sync`, { method: 'POST', body: {} }));
      await onChanged();
    });

  const disconnect = () => {
    if (!confirm(`Отключить ${name}? Доступ будет стёрт, звонки перестанут добираться.`)) return;
    void run(async () => {
      await request(`/calls/integrations/${path}`, { method: 'DELETE' });
      setResult(null);
      await onChanged();
    });
  };

  return (
    <Card title={title}>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {state?.isActive ? (
        <>
          <div style={styles.row}>
            <code>{state.credentialsMasked}</code>
            <Badge tone={state.lastSyncStatus === 'ERROR' ? 'danger' : state.lastSyncStatus ? 'success' : 'neutral'}>
              {state.lastSyncStatus === 'ERROR' ? 'ошибка' : state.lastSyncStatus ? 'работает' : 'ещё не добирал'}
            </Badge>
          </div>
          {state.lastSyncAt ? (
            <p style={styles.muted}>Последний добор: {new Date(state.lastSyncAt).toLocaleString('ru-RU')}</p>
          ) : null}
          {state.lastSyncError ? <ErrorText>{state.lastSyncError}</ErrorText> : null}

          <div style={styles.actions}>
            <Button onClick={sync} disabled={busy}>
              {busy ? 'Добираем…' : 'Добрать звонки сейчас'}
            </Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Отключить
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={connect}>
          {fields.map((field) => (
            <Field key={field.name} label={field.label}>
              <Input
                required
                type={field.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={field.placeholder}
                value={values[field.name] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              />
            </Field>
          ))}
          <p style={styles.muted}>{hint}</p>
          <Button type="submit" disabled={busy}>
            Подключить {name}
          </Button>
        </form>
      )}

      {result ? (
        <div style={styles.result}>
          Получено {result.fetched}, загружено {result.imported}, повторов {result.duplicates}
          {result.withoutEmployee > 0 ? `, без сотрудника ${result.withoutEmployee}` : ''}.
          {result.unmatched.length > 0 ? (
            <div style={styles.warning}>
              <strong>Не привязаны к сотрудникам ({keyLabel}):</strong>{' '}
              {result.unmatched
                .slice(0, 10)
                .map((item) => `${item.employeeKey} — ${item.count}`)
                .join(', ')}
              <p style={styles.muted}>Привяжите их в разделе «Рабочие номера», иначе звонки не попадут в работу.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  muted: { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 },
  actions: { display: 'flex', gap: 8, marginTop: 12 },
  result: {
    marginTop: 16,
    padding: 14,
    background: 'var(--surface-muted)',
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.6,
  },
  warning: { marginTop: 8, color: 'var(--warning)', fontSize: 13 },
};
