import { CallsSyncScheduler } from '../src/calls/calls-sync.scheduler';
import { JobLockService } from '../src/common/jobs/job-lock.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const AT = new Date('2026-10-16T10:30:00Z');

function setup(options: { failFor?: string[] } = {}) {
  const firestore = new FakeFirestore();
  const firebase = fakeFirebase(firestore);

  const synced: string[] = [];
  const bitrix = {
    sync: async (organizationId: string) => {
      if (options.failFor?.includes(organizationId)) {
        throw new Error('портал недоступен');
      }
      synced.push(organizationId);
      return { imported: 3, duplicates: 0, unmatched: [], fetched: 3, rejected: 0, truncated: false };
    },
  };

  const pbx = {
    syncKcell: async (organizationId: string) => {
      synced.push(`${organizationId}:KCELL`);
      return { imported: 5 };
    },
    syncSipuni: async (organizationId: string) => {
      if (options.failFor?.includes(`${organizationId}:SIPUNI`)) throw new Error('Sipuni недоступен');
      synced.push(`${organizationId}:SIPUNI`);
      return { imported: 2 };
    },
  };

  const dealsSynced: string[] = [];
  const deals = {
    sync: async (organizationId: string) => {
      if (options.failFor?.includes(`${organizationId}:DEALS`)) throw new Error('CRM недоступна');
      dealsSynced.push(organizationId);
      return { created: 2, updated: 1, unchanged: 5, unmatched: [], fetched: 8, rejected: 0, truncated: false };
    },
  };

  const scheduler = new CallsSyncScheduler(
    firebase,
    bitrix as never,
    new JobLockService(firebase),
    pbx as never,
    deals as never,
  );

  return { firestore, scheduler, synced, dealsSynced };
}

function seedIntegration(firestore: FakeFirestore, organizationId: string, provider = 'BITRIX') {
  firestore.seed(COLLECTIONS.integrations, `${organizationId}_${provider}`, {
    organizationId,
    provider,
    webhookUrl: 'https://portal.example/rest/1/secret/',
  });
}

describe('автоматический добор звонков', () => {
  it('обходит организации с подключённым порталом', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1');
    seedIntegration(firestore, 'org-2');

    await scheduler.syncAll(AT);

    expect(synced).toEqual(['org-1', 'org-2']);
  });

  it('Kcell без ключа API пропускается', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1', 'KCELL');

    await scheduler.syncAll(AT);

    // Без ключа API выгрузка Kcell приходит файлом, тянуть по сети нечего.
    expect(synced).toEqual([]);
  });

  it('второй экземпляр сервера ту же работу не делает', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1');

    await scheduler.syncAll(AT);
    await scheduler.syncAll(AT);

    // Расписание срабатывает в каждом экземпляре; дважды тянуть
    // один и тот же час — лишние запросы к порталу и к базе.
    expect(synced).toEqual(['org-1']);
  });

  it('следующий час берётся заново', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1');

    await scheduler.syncAll(AT);
    await scheduler.syncAll(new Date('2026-10-16T11:30:00Z'));

    expect(synced).toEqual(['org-1', 'org-1']);
  });

  it('недоступный портал не срывает остальные организации', async () => {
    const { firestore, scheduler, synced } = setup({ failFor: ['org-1'] });
    seedIntegration(firestore, 'org-1');
    seedIntegration(firestore, 'org-2');

    await scheduler.syncAll(AT);

    expect(synced).toEqual(['org-2']);
  });

  it('после сбоя час можно повторить', async () => {
    const { firestore, scheduler } = setup({ failFor: ['org-1'] });
    seedIntegration(firestore, 'org-1');

    await scheduler.syncAll(AT);

    // Замок снят, иначе сбой закрыл бы этот час навсегда.
    expect(firestore.all(COLLECTIONS.jobRuns)).toHaveLength(0);
  });

  it('прогон отмечается в базе вместе с объёмом', async () => {
    const { firestore, scheduler } = setup();
    seedIntegration(firestore, 'org-1');

    await scheduler.syncAll(AT);

    const [run] = firestore.all(COLLECTIONS.jobRuns);
    expect(run?.marked).toBe(3);
  });
});

describe('звонки из АТС по расписанию', () => {
  const seedPbx = (firestore: FakeFirestore, organizationId: string, provider: 'KCELL' | 'SIPUNI') =>
    firestore.seed(COLLECTIONS.integrations, `${organizationId}_${provider}`, {
      organizationId,
      provider,
      isActive: true,
      credentials: { any: 'value' },
    });

  it('Kcell и Sipuni одной организации добираются оба', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1');
    seedPbx(firestore, 'org-1', 'KCELL');
    seedPbx(firestore, 'org-1', 'SIPUNI');

    const results = await scheduler.syncAll(AT);

    expect(synced).toEqual(['org-1', 'org-1:KCELL', 'org-1:SIPUNI']);
    expect(results.map((item) => item.source)).toEqual(['BITRIX', 'KCELL', 'SIPUNI']);
  });

  it('сбой Sipuni не срывает Kcell', async () => {
    const { firestore, scheduler, synced } = setup({ failFor: ['org-1:SIPUNI'] });
    seedPbx(firestore, 'org-1', 'SIPUNI');
    seedPbx(firestore, 'org-1', 'KCELL');

    await scheduler.syncAll(AT);

    expect(synced).toContain('org-1:KCELL');
  });

  it('отключённая АТС не добирается', async () => {
    const { firestore, scheduler, synced } = setup();
    firestore.seed(COLLECTIONS.integrations, 'org-1_KCELL', {
      organizationId: 'org-1',
      provider: 'KCELL',
      isActive: false,
      credentials: null,
    });

    await scheduler.syncAll(AT);

    expect(synced).toEqual([]);
  });
});

describe('автоматический добор сделок CRM', () => {
  it('обходит организации с вебхуком Bitrix24 и считает новые и изменённые', async () => {
    const { firestore, scheduler, dealsSynced } = setup();
    seedIntegration(firestore, 'org-1');
    seedIntegration(firestore, 'org-2', 'KCELL');

    const results = await scheduler.syncDeals(AT);

    expect(dealsSynced).toEqual(['org-1']);
    expect(results).toEqual([{ organizationId: 'org-1', changed: 3 }]);
  });

  it('отключённый портал и портал без вебхука пропускаются', async () => {
    const { firestore, scheduler, dealsSynced } = setup();
    firestore.seed(COLLECTIONS.integrations, 'org-1_BITRIX', { organizationId: 'org-1', provider: 'BITRIX', isActive: false, webhookUrl: 'x' });
    firestore.seed(COLLECTIONS.integrations, 'org-2_BITRIX', { organizationId: 'org-2', provider: 'BITRIX', isActive: true, webhookUrl: null });

    await scheduler.syncDeals(AT);

    expect(dealsSynced).toEqual([]);
  });

  it('второй экземпляр сервера в тот же час сделки не добирает', async () => {
    const { firestore, scheduler, dealsSynced } = setup();
    seedIntegration(firestore, 'org-1');

    await scheduler.syncDeals(AT);
    await scheduler.syncDeals(AT);

    expect(dealsSynced).toEqual(['org-1']);
  });

  it('сбой сделок одной организации не мешает другим', async () => {
    const { firestore, scheduler, dealsSynced } = setup({ failFor: ['org-1:DEALS'] });
    seedIntegration(firestore, 'org-1');
    seedIntegration(firestore, 'org-2');

    await scheduler.syncDeals(AT);

    expect(dealsSynced).toEqual(['org-2']);
  });

  it('часовой прогон добирает и звонки, и сделки', async () => {
    const { firestore, scheduler, synced, dealsSynced } = setup();
    seedIntegration(firestore, 'org-1');

    await scheduler.runHourly();

    expect(synced).toEqual(['org-1']);
    expect(dealsSynced).toEqual(['org-1']);
  });
});
