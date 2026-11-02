import { Timestamp } from 'firebase-admin/firestore';

import type { BitrixClient } from '../src/calls/bitrix-client';
import { IntegrationsService } from '../src/calls/integrations.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { BitrixDealsSyncService } from '../src/offers/bitrix-deals-sync.service';
import { DealsImportService } from '../src/offers/deals-import.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const WEBHOOK = 'https://corpsol.bitrix24.kz/rest/1/s3cr3ttok3n';
/** 2 ноября 2026, 15:00 по Алматы. */
const NOW = new Date('2026-11-02T10:00:00Z');

function setup(options: { records?: unknown[]; truncated?: boolean; error?: Error; deals?: unknown } = {}) {
  const firestore = new FakeFirestore();
  const firebase = fakeFirebase(firestore);
  firestore.seed(COLLECTIONS.users, 'dina', { organizationId: ORG, fullName: 'Дина', status: 'ACTIVE', departmentId: 'kz' });
  firestore.seed(COLLECTIONS.externalIdentities, 'BITRIX_12', { provider: 'BITRIX', externalKey: '12', userId: 'dina', organizationId: ORG });
  firestore.seed(COLLECTIONS.integrations, `${ORG}_BITRIX`, {
    organizationId: ORG, provider: 'BITRIX', isActive: true, webhookUrl: WEBHOOK,
    lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, syncedUpTo: null, deals: options.deals ?? null,
  });

  const requested: Array<Date | undefined> = [];
  const assigned: Array<string[] | undefined> = [];
  const client = {
    fetchDeals: async (_url: string, since?: Date, assignedTo?: string[]) => {
      requested.push(since);
      assigned.push(assignedTo);
      if (options.error) throw options.error;
      return { records: options.records ?? [], truncated: options.truncated ?? false };
    },
  } as unknown as BitrixClient;

  const service = new BitrixDealsSyncService(client, new IntegrationsService(firebase), new DealsImportService(firebase));
  const state = () => firestore.read(COLLECTIONS.integrations, `${ORG}_BITRIX`)?.deals as Record<string, unknown>;
  return { firestore, service, requested, assigned, state };
}

const won = (id: string, assigned = '12') => ({
  ID: id, TITLE: `Сделка ${id}`, OPPORTUNITY: '100000', STAGE_SEMANTIC_ID: 'S', ASSIGNED_BY_ID: assigned,
  DATE_CREATE: '2026-10-20T10:00:00+05:00', CLOSEDATE: '2026-11-01T12:00:00+05:00',
});

describe('добор сделок Bitrix24', () => {
  it('первый раз — с начала месяца по Алматы', async () => {
    const { service, requested } = setup();

    await service.sync(ORG, NOW);

    expect(requested[0]?.toISOString()).toBe('2026-10-31T19:00:00.000Z');
  });

  it('дальше — с прошлой точки с перекрытием в полчаса', async () => {
    const { service, requested } = setup({
      deals: { syncedUpTo: Timestamp.fromDate(new Date('2026-11-02T09:00:00Z')), lastSyncAt: null, lastSyncStatus: 'OK', lastSyncError: null },
    });

    await service.sync(ORG, NOW);

    expect(requested[0]?.toISOString()).toBe('2026-11-02T08:30:00.000Z');
  });

  it('успешная сделка становится регистрацией, точка сдвигается на сейчас', async () => {
    const { firestore, service, state } = setup({ records: [won('101'), won('102', '99'), { ID: '103' }] });

    const result = await service.sync(ORG, NOW);

    expect(result).toMatchObject({ fetched: 3, rejected: 1, created: 1, unmatched: [{ employeeKey: '99', count: 1 }] });
    expect(firestore.read(COLLECTIONS.offers, 'BITRIX_101')).toMatchObject({ status: 'ACCEPTED', sentDate: '2026-11-01' });
    expect((state().syncedUpTo as Timestamp).toDate().toISOString()).toBe(NOW.toISOString());
  });

  it('неполная выгрузка — точка до последней полученной сделки, дальше продолжит с неё', async () => {
    const { service, state } = setup({
      records: [
        { ...won('101'), DATE_MODIFY: '2026-10-10T12:00:00+05:00' },
        { ...won('102'), DATE_MODIFY: '2026-10-12T09:00:00+05:00' },
      ],
      truncated: true,
    });

    await service.sync(ORG, NOW);

    expect((state().syncedUpTo as Timestamp).toDate().toISOString()).toBe('2026-10-12T04:00:00.000Z');
  });

  it('неполная выгрузка без дат изменения — точка остаётся прежней', async () => {
    const { service, state } = setup({ records: [won('101')], truncated: true });

    await service.sync(ORG, NOW);

    expect(state()).toMatchObject({ lastSyncStatus: 'OK', syncedUpTo: null });
  });

  it('сбой портала записывается и пробрасывается', async () => {
    const { service, state } = setup({ error: new Error('Bitrix24: insufficient_scope') });

    await expect(service.sync(ORG, NOW)).rejects.toThrow('insufficient_scope');
    expect(state()).toMatchObject({ lastSyncStatus: 'ERROR', lastSyncError: 'Bitrix24: insufficient_scope' });
  });

  it('передобор с заданной даты', async () => {
    const { service, requested } = setup();

    await service.sync(ORG, NOW, new Date('2026-09-30T19:00:00Z'));

    expect(requested[0]?.toISOString()).toBe('2026-09-30T19:00:00.000Z');
  });
});

describe('только сделки своих', () => {
  it('у портала просятся сделки только привязанных сотрудников', async () => {
    const { service, assigned } = setup();

    await service.sync(ORG, NOW);

    expect(assigned[0]).toEqual(['12']);
  });

  it('никто не привязан — портал не трогаем, но добор считается успешным', async () => {
    const { firestore, service, requested, state } = setup();
    firestore.seed(COLLECTIONS.externalIdentities, 'BITRIX_12', { provider: 'KCELL_USER', externalKey: 'x', userId: 'dina' });

    const result = await service.sync(ORG, NOW);

    expect(requested).toEqual([]);
    expect(result.fetched).toBe(0);
    expect(state()).toMatchObject({ lastSyncStatus: 'OK' });
  });
});
