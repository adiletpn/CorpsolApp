import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { DevicesService } from '../src/devices/devices.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeAuth, FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const HR = 'hr-1';

function setup() {
  const firestore = new FakeFirestore();
  const auth = new FakeAuth();
  return { firestore, auth, service: new DevicesService(fakeFirebase(firestore, auth)) };
}

async function seedUser(
  firestore: FakeFirestore,
  auth: FakeAuth,
  uid: string,
  fields: Record<string, unknown> = {},
): Promise<void> {
  await auth.createUser({ uid, email: `${uid}@corpsol.kz`, password: 'secret' });
  firestore.seed(COLLECTIONS.users, uid, {
    organizationId: ORG,
    fullName: `Сотрудник ${uid}`,
    email: `${uid}@corpsol.kz`,
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: 'office-1',
    hiredAt: Timestamp.fromDate(new Date('2026-01-10T00:00:00Z')),
    terminatedAt: null,
    baseSalaryMinor: 0,
    currency: 'KZT',
    ...fields,
  });
}

function seedRequest(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
): void {
  firestore.seed(COLLECTIONS.deviceRequests, id, {
    userId: 'uid-1',
    deviceId: 'phone-2',
    platform: 'ios',
    model: 'iPhone 14',
    status: 'PENDING',
    createdAt: Timestamp.fromDate(new Date('2026-09-20T10:00:00Z')),
    resolvedAt: null,
    resolvedBy: null,
    resolveNote: null,
    ...fields,
  });
}

describe('устройства: открепление', () => {
  it('без привязки открепить нечего', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');

    await expect(service.unbind('uid-1', HR)).rejects.toThrow(NotFoundException);
  });
});

describe('устройства: открепление снимает доступ', () => {
  it('привязка гасится с отметкой, кто открепил', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });

    await service.unbind('uid-1', HR);

    expect(firestore.read(COLLECTIONS.devices, 'phone-1')).toMatchObject({
      isActive: false,
      revokedBy: HR,
    });
  });

  it('открепление гасит токены, иначе старый токен работал бы ещё час', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });

    await service.unbind('uid-1', HR);

    expect(auth.record('uid-1')?.tokensRevokedAt).not.toBeNull();
  });
});

describe('устройства: след в журнале', () => {
  it('открепление записывается в журнал событий организации', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });

    await service.unbind('uid-1', HR);

    const events = firestore.all(COLLECTIONS.auditEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      organizationId: ORG,
      actorId: HR,
      action: 'device.unbind',
      targetId: 'uid-1',
      metadata: { deviceId: 'phone-1' },
    });
  });
});

describe('устройства: активная привязка', () => {
  it('открепление снимает сотрудника с поиска активной привязки', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });
    await service.unbind('uid-1', HR);

    expect(await service.findActiveBinding('uid-1')).toBeNull();
  });

  it('откреплённый телефон можно выдать другому сотруднику', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await seedUser(firestore, auth, 'uid-2');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });
    await service.unbind('uid-1', HR);

    const device = await service.bind('uid-2', { deviceId: 'phone-1', platform: 'android' });

    expect(device.userId).toBe('uid-2');
    expect(firestore.read(COLLECTIONS.devices, 'phone-1')).toMatchObject({
      userId: 'uid-2',
      revokedBy: null,
    });
  });
});

describe('заявки: одобрение', () => {
  it('новый телефон встаёт на место старого', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.bind('uid-1', { deviceId: 'phone-1', platform: 'android' });
    seedRequest(firestore, 'req-1');

    const device = await service.approveRequest('req-1', HR);

    expect(device.deviceId).toBe('phone-2');
    expect(firestore.read(COLLECTIONS.devices, 'phone-1')?.isActive).toBe(false);
    expect(firestore.read(COLLECTIONS.devices, 'phone-2')?.isActive).toBe(true);
  });

  it('заявка помечается обработанной с автором решения', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    seedRequest(firestore, 'req-1');

    await service.approveRequest('req-1', HR, 'телефон сменил');

    expect(firestore.read(COLLECTIONS.deviceRequests, 'req-1')).toMatchObject({
      status: 'APPROVED',
      resolvedBy: HR,
      resolveNote: 'телефон сменил',
    });
  });
});
