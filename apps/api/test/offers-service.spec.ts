import { Timestamp } from 'firebase-admin/firestore';

import { OffersService } from '../src/offers/offers.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const actor = (
  role: AuthenticatedUser['role'],
  id = 'mop-1',
  extra: Partial<AuthenticatedUser> = {},
) =>
  ({
    id,
    organizationId: ORG,
    email: `${id}@corpsol.kz`,
    role,
    departmentId: 'dep-1',
    officeId: null,
    deviceId: 'phone-1',
    ...extra,
  }) as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();

  for (const id of ['mop-1', 'mop-2']) {
    firestore.seed(COLLECTIONS.users, id, {
      organizationId: ORG,
      fullName: id,
      email: `${id}@corpsol.kz`,
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: 'dep-1',
      officeId: null,
      baseSalaryMinor: 0,
    });
  }

  return { firestore, service: new OffersService(fakeFirebase(firestore)) };
}

function seedOffer(firestore: FakeFirestore, id: string, fields: Record<string, unknown> = {}) {
  firestore.seed(COLLECTIONS.offers, id, {
    userId: 'mop-1',
    organizationId: ORG,
    departmentId: 'dep-1',
    clientName: 'Клиент',
    clientPhone: null,
    amountMinor: 100_000,
    status: 'SENT',
    sentAt: Timestamp.now(),
    sentDate: '2026-09-15',
    resolvedAt: null,
    ...fields,
  });
}

describe('создание сделки', () => {
  it('заводится только на себя', async () => {
    const { service } = setup();

    const offer = await service.create(actor('MOP'), {
      clientName: 'Новый клиент',
      amountMinor: 500_000,
    });

    // Возможность выписать сделку на чужое имя ломала бы планы и премии.
    expect(offer.userId).toBe('mop-1');
  });

  it('копирует отдел автора', async () => {
    const { firestore, service } = setup();

    const offer = await service.create(actor('MOP'), { clientName: 'К', amountMinor: 1 });

    // Firestore не умеет join, а выборка по отделу нужна для общего плана.
    expect(firestore.read(COLLECTIONS.offers, offer.id)?.departmentId).toBe('dep-1');
  });

  it('создаётся со статусом «ждёт решения»', async () => {
    const { service } = setup();

    const offer = await service.create(actor('MOP'), { clientName: 'К', amountMinor: 1 });

    expect(offer.status).toBe('SENT');
  });
});

describe('решение по сделке', () => {
  it('менеджер не подтверждает собственную сделку', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1', { userId: 'mop-1' });

    // Подтверждать не должен тот, кому за это платят премию.
    await expect(
      service.resolve(actor('MOP'), 'o1', 'ACCEPTED'),
    ).rejects.toThrow(/руководитель/);
  });

  it('руководитель подтверждает', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1');

    const resolved = await service.resolve(actor('ROP', 'rop-1'), 'o1', 'ACCEPTED');

    expect(resolved.status).toBe('ACCEPTED');
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it('менеджер может отметить отказ по своей сделке', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1', { userId: 'mop-1' });

    // Отказ автору невыгоден, подделывать его незачем.
    const resolved = await service.resolve(actor('MOP'), 'o1', 'REJECTED');

    expect(resolved.status).toBe('REJECTED');
  });

  it('менеджер не трогает чужую сделку', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1', { userId: 'mop-2' });

    await expect(service.resolve(actor('MOP'), 'o1', 'REJECTED')).rejects.toThrow();
  });

  it('решение принимается один раз', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1', { status: 'ACCEPTED' });

    await expect(
      service.resolve(actor('ROP', 'rop-1'), 'o1', 'REJECTED'),
    ).rejects.toThrow(/уже принято/);
  });

  it('подтверждение пишется в журнал аудита', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'o1');

    await service.resolve(actor('ROP', 'rop-1'), 'o1', 'ACCEPTED', 'Договор подписан');

    const events = firestore.all(COLLECTIONS.auditEvents);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('offer.accepted');
    expect(events[0].organizationId).toBe(ORG);
  });
});

describe('видимость сделок', () => {
  it('менеджер видит только свои', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'mine', { userId: 'mop-1' });
    seedOffer(firestore, 'colleague', { userId: 'mop-2' });

    const offers = await service.list(actor('MOP'));

    expect(offers).toHaveLength(1);
  });

  it('руководитель видит отдел целиком', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'a', { userId: 'mop-1', departmentId: 'dep-1' });
    seedOffer(firestore, 'b', { userId: 'mop-2', departmentId: 'dep-1' });
    seedOffer(firestore, 'other', { userId: 'mop-3', departmentId: 'dep-2' });

    const offers = await service.list(actor('ROP', 'rop-1'));

    expect(offers).toHaveLength(2);
  });

  it('сделки чужой организации не видны', async () => {
    const { firestore, service } = setup();
    seedOffer(firestore, 'ours');
    seedOffer(firestore, 'alien', { organizationId: 'other-org' });

    const offers = await service.list(actor('DIRECTOR', 'dir', { departmentId: null }));

    expect(offers).toHaveLength(1);
  });
});
