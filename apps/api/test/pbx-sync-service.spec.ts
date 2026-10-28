import { Timestamp } from 'firebase-admin/firestore';

import { CallsImportService } from '../src/calls/calls-import.service';
import { IntegrationsService } from '../src/calls/integrations.service';
import type { KcellApiClient } from '../src/calls/kcell-api-client';
import { PbxSyncService, almatyDayStart, almatyMonthStart } from '../src/calls/pbx-sync.service';
import type { SipuniApiClient } from '../src/calls/sipuni-api-client';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
/** 10 августа 2026, 15:00 по Алматы. */
const NOW = new Date('2026-08-10T10:00:00Z');

function setup(options: { kcellRows?: unknown[]; csv?: string; kcellError?: Error } = {}) {
  const firestore = new FakeFirestore();
  const firebase = fakeFirebase(firestore);

  firestore.seed(COLLECTIONS.users, 'dina', {
    organizationId: ORG,
    fullName: 'Дина',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
  });
  firestore.seed(COLLECTIONS.externalIdentities, 'KCELL_USER_dina', {
    userId: 'dina', provider: 'KCELL_USER', externalKey: 'dina', organizationId: ORG,
  });
  firestore.seed(COLLECTIONS.externalIdentities, 'SIPUNI_236', {
    userId: 'dina', provider: 'SIPUNI', externalKey: '236', organizationId: ORG,
  });
  firestore.seed(COLLECTIONS.integrations, `${ORG}_KCELL`, {
    organizationId: ORG, provider: 'KCELL', isActive: true, webhookUrl: null,
    credentials: { baseUrl: 'https://corpsol.vpbx.kcell.kz/crmapi/v1', apiKey: 'k' },
    lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, syncedUpTo: null,
  });
  firestore.seed(COLLECTIONS.integrations, `${ORG}_SIPUNI`, {
    organizationId: ORG, provider: 'SIPUNI', isActive: true, webhookUrl: null,
    credentials: { user: '012345', secret: 's' },
    lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, syncedUpTo: null,
  });

  const ranges: Array<[Date, Date]> = [];
  const kcell = {
    fetchHistory: async (_credentials: unknown, from: Date, to: Date) => {
      if (options.kcellError) throw options.kcellError;
      ranges.push([from, to]);
      return (options.kcellRows ?? []).filter((row) => {
        const start = new Date((row as { start: string }).start);
        return start >= from && start <= to;
      });
    },
  } as unknown as KcellApiClient;
  const sipuni = { exportAll: async () => options.csv ?? '' } as unknown as SipuniApiClient;

  const service = new PbxSyncService(
    firebase,
    new IntegrationsService(firebase),
    new CallsImportService(firebase),
    kcell,
    sipuni,
  );
  return { firestore, service, ranges };
}

const kcellRow = (uid: string, start: string, fields: Record<string, unknown> = {}) => ({
  uid, start, type: 'out', status: 'success', user: 'dina', client: '77000000001', wait: 5, duration: 30, ...fields,
});

describe('границы дней по Алматы', () => {
  it('полночь по Алматы — 19:00 UTC накануне', () => {
    expect(almatyDayStart(NOW).toISOString()).toBe('2026-08-09T19:00:00.000Z');
  });

  it('первое число месяца по Алматы', () => {
    expect(almatyMonthStart(NOW).toISOString()).toBe('2026-07-31T19:00:00.000Z');
  });
});

describe('звонки Kcell', () => {
  it('первый раз — с начала месяца, по дню на запрос', async () => {
    const { service, ranges } = setup();

    await service.syncKcell(ORG, NOW);

    // 1–10 августа: десять дней — десять запросов, последний до «сейчас».
    expect(ranges).toHaveLength(10);
    expect(ranges[0][0].toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(ranges[9][1]).toEqual(NOW);
  });

  it('звонки ложатся на сотрудника по логину АТС', async () => {
    const { service, firestore } = setup({ kcellRows: [kcellRow('U1', '2026-08-10T05:00:00Z')] });

    const result = await service.syncKcell(ORG, NOW);

    expect(result.imported).toBe(1);
    expect(firestore.all(COLLECTIONS.calls)[0]).toMatchObject({ userId: 'dina', source: 'KCELL', callDate: '2026-08-10' });
  });

  it('потом — от прошлой точки с перекрытием, без дублей', async () => {
    const rows = [kcellRow('U1', '2026-08-10T09:50:00Z')];
    const { service, ranges, firestore } = setup({ kcellRows: rows });

    await service.syncKcell(ORG, NOW);
    ranges.length = 0;
    const second = await service.syncKcell(ORG, new Date('2026-08-10T11:00:00Z'));

    // Перекрытие 30 минут захватило уже загруженный звонок — он не задвоился.
    expect(ranges[0][0].toISOString()).toBe('2026-08-10T09:30:00.000Z');
    expect(second.duplicates).toBe(1);
    expect(firestore.all(COLLECTIONS.calls)).toHaveLength(1);
  });

  it('сбой АТС записывается в интеграцию — его видно в панели', async () => {
    const { service, firestore } = setup({ kcellError: new Error('API Kcell отклонил ключ') });

    await expect(service.syncKcell(ORG, NOW)).rejects.toThrow('отклонил ключ');
    expect(firestore.read(COLLECTIONS.integrations, `${ORG}_KCELL`)).toMatchObject({
      lastSyncStatus: 'ERROR',
      lastSyncError: 'API Kcell отклонил ключ',
    });
  });
});

describe('звонки Sipuni', () => {
  const HEADER = 'Тип;Статус;Время;Схема;Откуда;Куда;Кто ответил;Длительность звонка, сек;Длительность разговора, сек;Время ответа, сек;Оценка;ID записи';

  it('по внутреннему номеру из привязок, только новее точки продолжения', async () => {
    const csv = [
      HEADER,
      'Исходящий;Отвечен;10.08.2026 14:00:00;исход nom 236;236;+77070000001;;40;30;;;R1',
      // Прошлый месяц: первая синхронизация берёт только текущий.
      'Исходящий;Отвечен;31.07.2026 14:00:00;исход nom 236;236;+77070000002;;40;30;;;R0',
    ].join('\n');
    const { service, firestore } = setup({ csv });

    const result = await service.syncSipuni(ORG, NOW);

    expect(result.imported).toBe(1);
    expect(firestore.all(COLLECTIONS.calls)[0]).toMatchObject({ userId: 'dina', source: 'SIPUNI' });
  });

  it('точка продолжения сдвигается после успешного запуска', async () => {
    const { service, firestore } = setup({ csv: HEADER });

    await service.syncSipuni(ORG, NOW);

    const stored = firestore.read(COLLECTIONS.integrations, `${ORG}_SIPUNI`)?.syncedUpTo as Timestamp;
    expect(stored.toDate()).toEqual(NOW);
  });
});

describe('передобор с даты', () => {
  it('звонки до привязки сотрудника добираются заново с начала месяца', async () => {
    const rows = [kcellRow('U-EARLY', '2026-08-03T05:00:00Z', { user: 'luiza' })];
    const { service, firestore } = setup({ kcellRows: rows });

    // Первый добор: логин luiza ещё ни к кому не привязан — звонок ничей.
    const first = await service.syncKcell(ORG, NOW);
    expect(first.unmatched).toEqual([{ employeeKey: 'luiza', count: 1 }]);

    firestore.seed(COLLECTIONS.externalIdentities, 'KCELL_USER_luiza', {
      userId: 'dina', provider: 'KCELL_USER', externalKey: 'luiza', organizationId: ORG,
    });

    // Обычный добор продолжает с прошлой точки — ранний звонок позади.
    const resumed = await service.syncKcell(ORG, new Date('2026-08-10T11:00:00Z'));
    expect(resumed.imported).toBe(0);

    // Передобор с первого числа кладёт его на сотрудника.
    const again = await service.syncKcell(
      ORG,
      new Date('2026-08-10T11:00:00Z'),
      new Date('2026-07-31T19:00:00Z'),
    );
    expect(again.imported).toBe(1);
  });
});
