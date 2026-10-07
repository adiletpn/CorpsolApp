import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { AuthService } from '../src/auth/auth.service';
import { DevicesService } from '../src/devices/devices.service';
import { AUTH_ERRORS } from '../src/auth/auth.errors';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeAuth, FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

/** Сервис устройств настоящий: вход и привязка телефона работают только вместе. */
function setup() {
  const firestore = new FakeFirestore();
  const auth = new FakeAuth();
  const firebase = fakeFirebase(firestore, auth);

  return {
    firestore,
    auth,
    service: new AuthService(firebase, new DevicesService(firebase)),
  };
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
    fullName: 'Асель Ким',
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

const phone = { deviceId: 'phone-1', platform: 'android' as const };

describe('вход: сотрудник не заведён', () => {
  it('без карточки сотрудника вход отклоняется, даже если учётка есть', async () => {
    const { auth, service } = setup();
    await auth.createUser({ uid: 'uid-1', email: 'ghost@corpsol.kz', password: 'secret' });

    await expect(service.openSession('uid-1', phone)).rejects.toThrow(UnauthorizedException);
  });
});
