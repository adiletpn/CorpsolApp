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

  const scheduler = new CallsSyncScheduler(
    firebase,
    bitrix as never,
    new JobLockService(firebase),
  );

  return { firestore, scheduler, synced };
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

  it('организация без Bitrix пропускается', async () => {
    const { firestore, scheduler, synced } = setup();
    seedIntegration(firestore, 'org-1', 'KCELL');

    await scheduler.syncAll(AT);

    // Выгрузка Kcell приходит файлом, тянуть по сети нечего.
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
