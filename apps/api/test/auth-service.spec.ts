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

describe('вход: профиль сотрудника', () => {
  it('возвращает отдел, офис и роль из карточки', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');

    const profile = await service.openSession('uid-1', phone);

    expect(profile).toMatchObject({
      id: 'uid-1',
      fullName: 'Асель Ким',
      role: 'MOP',
      departmentId: 'dep-1',
      officeId: 'office-1',
    });
  });
});

describe('вход: роль в претензиях токена', () => {
  it('роль из карточки попадает в претензии токена', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1', { role: 'HR' });

    await service.openSession('uid-1');

    expect(auth.record('uid-1')?.claims).toEqual({ role: 'HR' });
  });

  it('смена роли в карточке доезжает до претензий на следующем входе', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1', { role: 'HR' });
    await service.openSession('uid-1');

    firestore.seed(COLLECTIONS.users, 'uid-1', {
      ...firestore.read(COLLECTIONS.users, 'uid-1'),
      role: 'DIRECTOR',
    });
    await service.openSession('uid-1');

    expect(auth.record('uid-1')?.claims).toEqual({ role: 'DIRECTOR' });
  });
});

describe('вход: телефон обязателен для МОПа', () => {
  it('МОП без предъявленного телефона получает отказ device_required', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1', { role: 'MOP' });

    await expect(service.openSession('uid-1')).rejects.toMatchObject({
      response: { code: AUTH_ERRORS.DEVICE_REQUIRED },
    });
  });

  it('директору телефон не нужен, привязка остаётся пустой', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1', { role: 'DIRECTOR' });

    const profile = await service.openSession('uid-1');

    expect(profile.boundDeviceId).toBeNull();
  });
});

describe('вход: первая привязка телефона', () => {
  it('первый вход закрепляет телефон за аккаунтом', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');

    const profile = await service.openSession('uid-1', phone);

    expect(profile.boundDeviceId).toBe('phone-1');
    expect(firestore.read(COLLECTIONS.devices, 'phone-1')).toMatchObject({
      userId: 'uid-1',
      isActive: true,
    });
  });

  it('повторный вход с того же телефона проходит без новой привязки', async () => {
    const { firestore, auth, service } = setup();
    await seedUser(firestore, auth, 'uid-1');
    await service.openSession('uid-1', phone);

    const profile = await service.openSession('uid-1', phone);

    expect(profile.boundDeviceId).toBe('phone-1');
    expect(firestore.all(COLLECTIONS.devices)).toHaveLength(1);
  });
});
