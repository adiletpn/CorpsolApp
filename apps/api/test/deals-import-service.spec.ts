import { COLLECTIONS } from '../src/firestore/collections';
import type { MappedDeal } from '../src/offers/bitrix-deals';
import { DealsImportService } from '../src/offers/deals-import.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

function setup() {
  const firestore = new FakeFirestore();
  firestore.seed(COLLECTIONS.users, 'dina', { organizationId: ORG, fullName: 'Дина', status: 'ACTIVE', departmentId: 'kz' });
  firestore.seed(COLLECTIONS.users, 'gone', { organizationId: ORG, fullName: 'Ушла', status: 'TERMINATED', departmentId: 'kz' });
  firestore.seed(COLLECTIONS.externalIdentities, 'BITRIX_12', { provider: 'BITRIX', externalKey: '12', userId: 'dina', organizationId: ORG });
  firestore.seed(COLLECTIONS.externalIdentities, 'BITRIX_13', { provider: 'BITRIX', externalKey: '13', userId: 'gone', organizationId: ORG });
  return { firestore, service: new DealsImportService(fakeFirebase(firestore)) };
}

const deal = (fields: Partial<MappedDeal> = {}): MappedDeal => ({
  externalId: '101',
  employeeKey: '12',
  clientName: 'ТОО «Алтын Дала»',
  amountMinor: 14_500_000,
  status: 'SENT',
  sentAt: new Date('2026-10-03T05:00:00Z'),
  sentDate: '2026-10-03',
  resolvedAt: null,
  modifiedAt: null,
  ...fields,
});

describe('сделки CRM в офферы', () => {
  it('сделка ложится на сотрудника и его отдел, с пометкой источника', async () => {
    const { firestore, service } = setup();

    const summary = await service.importDeals(ORG, [deal()]);

    expect(summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, unmatched: [] });
    expect(firestore.read(COLLECTIONS.offers, 'BITRIX_101')).toMatchObject({
      userId: 'dina',
      departmentId: 'kz',
      organizationId: ORG,
      status: 'SENT',
      source: 'BITRIX',
      externalId: '101',
    });
  });

  it('сделка перешла в успешные — та же запись становится регистрацией', async () => {
    const { firestore, service } = setup();
    await service.importDeals(ORG, [deal()]);

    const summary = await service.importDeals(ORG, [
      deal({ status: 'ACCEPTED', sentDate: '2026-10-15', resolvedAt: new Date('2026-10-15T13:00:00Z') }),
    ]);

    expect(summary).toMatchObject({ created: 0, updated: 1 });
    expect(firestore.all(COLLECTIONS.offers)).toHaveLength(1);
    expect(firestore.read(COLLECTIONS.offers, 'BITRIX_101')).toMatchObject({ status: 'ACCEPTED', sentDate: '2026-10-15' });
  });

  it('повтор без изменений не переписывает запись', async () => {
    const { service } = setup();
    await service.importDeals(ORG, [deal()]);

    expect(await service.importDeals(ORG, [deal()])).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  it('ответственный без привязки или уволенный — в несопоставленные, сделка не теряется молча', async () => {
    const { firestore, service } = setup();

    const summary = await service.importDeals(ORG, [deal({ externalId: '1', employeeKey: '99' }), deal({ externalId: '2', employeeKey: '99' }), deal({ externalId: '3', employeeKey: '13' })]);

    expect(summary.unmatched).toEqual([
      { employeeKey: '99', count: 2 },
      { employeeKey: '13', count: 1 },
    ]);
    expect(firestore.all(COLLECTIONS.offers)).toHaveLength(0);
  });

  it('сделку передали другому менеджеру — переезжает к нему', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'mariya', { organizationId: ORG, fullName: 'Мария', status: 'ACTIVE', departmentId: 'kz' });
    firestore.seed(COLLECTIONS.externalIdentities, 'BITRIX_14', { provider: 'BITRIX', externalKey: '14', userId: 'mariya', organizationId: ORG });
    await service.importDeals(ORG, [deal()]);

    await service.importDeals(ORG, [deal({ employeeKey: '14' })]);

    expect(firestore.read(COLLECTIONS.offers, 'BITRIX_101')).toMatchObject({ userId: 'mariya' });
  });
});
