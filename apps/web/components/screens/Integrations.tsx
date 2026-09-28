'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { request } from '../../lib/api';
import { Badge, Button, Card, Empty, ErrorText, Field, Input } from '../ui';

interface Integration {
  provider: 'BITRIX' | 'KCELL';
  isActive: boolean;
  webhookMasked: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  syncedUpTo: string | null;
}

interface SyncResult {
  imported: number;
  duplicates: number;
  fetched: number;
  rejected: number;
  truncated: boolean;
  unmatched: Array<{ employeeKey: string; count: number }>;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  unmatched: Array<{ employeeKey: string; count: number }>;
  rejectedRows: Array<{ line: number; reason: string }>;
}

function Unmatched({ items }: { items: Array<{ employeeKey: string; count: number }> }) {
  if (items.length === 0) return null;

  return (
    <div style={styles.warning}>
      <strong>Не сопоставлено с сотрудниками:</strong>
      <ul style={styles.list}>
        {items.slice(0, 10).map((item) => (
          <li key={item.employeeKey}>
            {item.employeeKey} — {item.count} звонк.
          </li>
        ))}
      </ul>
      <p style={styles.warningHint}>
        Заведите эти номера в разделе рабочих номеров, иначе звонки не попадут
        ни в планы, ни в аналитику.
      </p>
    </div>
  );
}

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhook, setWebhook] = useState('');
  const [csv, setCsv] = useState('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setIntegrations(await request<Integration[]>('/calls/integrations'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить интеграции');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await request('/calls/integrations/bitrix', {
        method: 'POST',
        body: { webhookUrl: webhook.trim() },
      });
      setWebhook('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подключить');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      setSyncResult(await request<SyncResult>('/calls/integrations/bitrix/sync', {
        method: 'POST',
        body: {},
      }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Синхронизация не удалась');
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      setImportResult(await request<ImportResult>('/calls/import', {
        method: 'POST',
        body: { content: csv, source: 'KCELL' },
      }));
      setCsv('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Импорт не удался');
    } finally {
      setBusy(false);
    }
  };

  const bitrix = integrations.find((item) => item.provider === 'BITRIX');

  return (
    <>
      <h1 style={styles.title}>Интеграции</h1>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card title="Bitrix24">
        {bitrix?.isActive ? (
          <>
            <div style={styles.row}>
              <span style={styles.muted}>Вебхук:</span>
              <code>{bitrix.webhookMasked}</code>
              <Badge tone={bitrix.lastSyncStatus === 'ERROR' ? 'danger' : 'success'}>
                {bitrix.lastSyncStatus ?? 'не синхронизировался'}
              </Badge>
            </div>

            {bitrix.lastSyncAt ? (
              <p style={styles.muted}>
                Последняя синхронизация: {new Date(bitrix.lastSyncAt).toLocaleString('ru-RU')}
              </p>
            ) : null}

            {bitrix.lastSyncError ? <ErrorText>{bitrix.lastSyncError}</ErrorText> : null}

            <Button onClick={sync} disabled={busy}>
              {busy ? 'Синхронизируем…' : 'Синхронизировать звонки'}
            </Button>
          </>
        ) : (
          <form onSubmit={connect}>
            <Field
              label="Адрес вебхука"
              hint="Настройки портала → Разработчикам → Входящий вебхук. Адрес хранится на сервере и наружу больше не отдаётся."
            >
              <Input
                required
                placeholder="https://portal.bitrix24.kz/rest/1/токен"
                value={webhook}
                onChange={(event) => setWebhook(event.target.value)}
              />
            </Field>

            <Button type="submit" disabled={busy}>
              Подключить
            </Button>
          </form>
        )}

        {syncResult ? (
          <div style={styles.result}>
            Получено {syncResult.fetched}, загружено {syncResult.imported}, повторов{' '}
            {syncResult.duplicates}, не разобрано {syncResult.rejected}.
            {syncResult.truncated ? ' Выгружено не всё — запустите ещё раз.' : ''}
            <Unmatched items={syncResult.unmatched} />
          </div>
        ) : null}
      </Card>

      <Card title="Kcell — загрузка детализации">
        <form onSubmit={importCsv}>
          <Field
            label="Содержимое файла"
            hint="Скопируйте CSV из кабинета оператора целиком, вместе со строкой заголовков."
          >
            <textarea
              required
              rows={8}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              style={styles.textarea}
            />
          </Field>

          <Button type="submit" disabled={busy || csv.trim() === ''}>
            {busy ? 'Загружаем…' : 'Загрузить звонки'}
          </Button>
        </form>

        {importResult ? (
          <div style={styles.result}>
            Загружено {importResult.imported}, повторов {importResult.duplicates},
            строк с ошибками {importResult.rejectedRows.length}.
            <Unmatched items={importResult.unmatched} />
            {importResult.rejectedRows.length > 0 ? (
              <ul style={styles.list}>
                {importResult.rejectedRows.slice(0, 5).map((row) => (
                  <li key={row.line}>
                    строка {row.line}: {row.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      {integrations.length === 0 ? (
        <Card>
          <Empty>Интеграции ещё не подключены</Empty>
        </Card>
      ) : null}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 26, margin: '0 0 24px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  muted: { color: 'var(--text-muted)', fontSize: 13 },
  textarea: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 12,
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'monospace',
    width: '100%',
    resize: 'vertical',
  },
  result: {
    marginTop: 16,
    padding: 14,
    background: 'var(--surface-muted)',
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.6,
  },
  warning: { marginTop: 12, color: 'var(--warning)', fontSize: 13 },
  warningHint: { color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 0 },
  list: { margin: '6px 0', paddingLeft: 20 },
};
