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
