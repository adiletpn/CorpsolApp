import { Timestamp } from 'firebase-admin/firestore';

import { BitrixSyncService } from '../src/calls/bitrix-sync.service';
import type { BitrixClient } from '../src/calls/bitrix-client';
import type { CallsImportService } from '../src/calls/calls-import.service';
import type { IntegrationsService } from '../src/calls/integrations.service';

const ORG = 'org-1';
const WEBHOOK = 'https://corpsol.bitrix24.kz/rest/1/token';

/** Запись портала в том виде, в каком её отдаёт Bitrix24. */
const record = (id: string, startedAt: string) => ({
  ID: id,
  CALL_START_DATE: startedAt,
  PORTAL_USER_ID: '7',
  PHONE_NUMBER: '+77010001122',
  CALL_DURATION: '95',
  CALL_TYPE: '1',
  CALL_FAILED_CODE: '200',
});

interface SyncCall {
  status: string;
  error?: string;
  syncedUpTo?: Date;
}

function setup(options: {
  records?: ReturnType<typeof record>[];
  truncated?: boolean;
  syncedUpTo?: Date;
  fetchThrows?: Error;
} = {}) {
  const syncs: SyncCall[] = [];
  let requestedFrom: Date | undefined;

  const client = {
    async fetchCalls({ fromDate }: { webhookUrl: string; fromDate?: Date }) {
      requestedFrom = fromDate;
      if (options.fetchThrows) throw options.fetchThrows;
      return { records: options.records ?? [], truncated: options.truncated ?? false };
    },
  } as unknown as BitrixClient;

  const integrations = {
    async requireWebhook() {
      return WEBHOOK;
    },
    async find() {
      return options.syncedUpTo
        ? { syncedUpTo: Timestamp.fromDate(options.syncedUpTo) }
        : null;
    },
    async recordSync(
      _org: string,
      _provider: string,
      status: string,
      extra: { error?: string; syncedUpTo?: Date } = {},
    ) {
      syncs.push({ status, error: extra.error, syncedUpTo: extra.syncedUpTo });
    },
  } as unknown as IntegrationsService;

  const importer = {
    async importCalls() {
      return { imported: 0, duplicates: 0, unmatched: [] };
    },
  } as unknown as CallsImportService;

  return {
    syncs,
    service: new BitrixSyncService(client, integrations, importer),
    get requestedFrom() {
      return requestedFrom;
    },
  };
}

describe('синхронизация Bitrix: с какого момента забираем', () => {
  it('первая синхронизация идёт без нижней границы', async () => {
    const harness = setup();

    await harness.service.sync(ORG);

    expect(harness.requestedFrom).toBeUndefined();
  });

  it('повторная отступает на полчаса назад', async () => {
    const point = new Date('2026-10-09T12:00:00Z');
    const harness = setup({ syncedUpTo: point });

    await harness.service.sync(ORG);

    // Звонок попадает в статистику портала не мгновенно: без перекрытия
    // записи, доехавшие с задержкой, терялись бы навсегда.
    expect(harness.requestedFrom?.toISOString()).toBe('2026-10-09T11:30:00.000Z');
  });

  it('явно переданная дата важнее сохранённой точки', async () => {
    const harness = setup({ syncedUpTo: new Date('2026-10-09T12:00:00Z') });
    const since = new Date('2026-10-01T00:00:00Z');

    await harness.service.sync(ORG, since);

    expect(harness.requestedFrom).toBe(since);
  });
});
