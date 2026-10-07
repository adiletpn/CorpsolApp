import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { TerminalsService } from '../src/attendance/terminals.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new TerminalsService(fakeFirebase(firestore)) };
}

function seedOffice(
  firestore: FakeFirestore,
  id: string,
  organizationId = ORG,
): void {
  firestore.seed(COLLECTIONS.offices, id, {
    organizationId,
    name: `Офис ${id}`,
    lat: 43.238,
    lng: 76.889,
    radiusMeters: 150,
    maxAccuracyMeters: 50,
    wifiBssids: [],
  });
}

function seedTerminal(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
): void {
  firestore.seed(COLLECTIONS.terminals, id, {
    officeId: 'office-1',
    name: `Терминал ${id}`,
    secret: 'secret-value',
    isActive: true,
    accessTokenHash: null,
    tokenIssuedAt: null,
    createdAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
    ...fields,
  });
}

const director = (fields: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'director-1',
  organizationId: ORG,
  email: 'director@corpsol.kz',
  role: 'DIRECTOR',
  departmentId: null,
  officeId: null,
  deviceId: null,
  ...fields,
});

describe('терминалы: создание', () => {
  it('новый терминал сразу активен и ещё без токена экрана', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');

    const view = await service.create(director(), 'office-1', 'Вход');

    expect(view.isActive).toBe(true);
    expect(view.hasAccessToken).toBe(false);
    expect(view.tokenIssuedAt).toBeNull();
  });
});

describe('терминалы: секрет подписи', () => {
  it('секрет не попадает в представление для администратора', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');

    const view = await service.create(director(), 'office-1', 'Вход');

    expect(view).not.toHaveProperty('secret');
  });
});

describe('терминалы: секрет у каждого свой', () => {
  it('два терминала одного офиса получают разные секреты', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');

    await service.create(director(), 'office-1', 'Вход');
    await service.create(director(), 'office-1', 'Склад');

    const secrets = firestore.all(COLLECTIONS.terminals).map((doc) => doc.secret);
    expect(new Set(secrets).size).toBe(2);
  });
});

describe('терминалы: чужой офис', () => {
  it('создать терминал в офисе другой организации нельзя', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-2', OTHER_ORG);

    await expect(service.create(director(), 'office-2', 'Вход')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('создать терминал в несуществующем офисе нельзя', async () => {
    const { service } = setup();

    await expect(service.create(director(), 'office-404', 'Вход')).rejects.toThrow(
      BadRequestException,
    );
  });
});
