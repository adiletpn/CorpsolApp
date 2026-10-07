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

describe('терминалы: включение и выключение', () => {
  it('выключенный терминал остаётся выключенным в базе', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedTerminal(firestore, 'term-1');

    const view = await service.setActive(director(), 'term-1', false);

    expect(view.isActive).toBe(false);
    expect(firestore.read(COLLECTIONS.terminals, 'term-1')?.isActive).toBe(false);
  });

  it('выключенный терминал можно включить обратно', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedTerminal(firestore, 'term-1', { isActive: false });

    const view = await service.setActive(director(), 'term-1', true);

    expect(view.isActive).toBe(true);
  });
});

describe('терминалы: доступ к чужому терминалу', () => {
  it('неизвестный терминал переключить нельзя', async () => {
    const { service } = setup();

    await expect(service.setActive(director(), 'term-404', false)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('терминал в офисе другой организации переключить нельзя', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-2', OTHER_ORG);
    seedTerminal(firestore, 'term-2', { officeId: 'office-2' });

    await expect(service.setActive(director(), 'term-2', false)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('терминалы: список', () => {
  it('терминалы чужой организации в список не попадают', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedOffice(firestore, 'office-2', OTHER_ORG);
    seedTerminal(firestore, 'term-1');
    seedTerminal(firestore, 'term-2', { officeId: 'office-2' });

    const list = await service.list(director());

    expect(list.map((item) => item.id)).toEqual(['term-1']);
  });
});

describe('терминалы: фильтр по офису', () => {
  it('фильтр оставляет терминалы только указанного офиса', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedOffice(firestore, 'office-3');
    seedTerminal(firestore, 'term-1');
    seedTerminal(firestore, 'term-3', { officeId: 'office-3' });

    const list = await service.list(director(), 'office-3');

    expect(list.map((item) => item.id)).toEqual(['term-3']);
  });

  it('фильтр по офису другой организации отвечает «не найдено»', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-2', OTHER_ORG);

    await expect(service.list(director(), 'office-2')).rejects.toThrow(NotFoundException);
  });
});

describe('терминалы: порядок в списке', () => {
  it('список отсортирован по названию по-русски', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedTerminal(firestore, 'term-1', { name: 'Ящик' });
    seedTerminal(firestore, 'term-2', { name: 'Авто' });
    seedTerminal(firestore, 'term-3', { name: 'Ёлка' });

    const list = await service.list(director());

    expect(list.map((item) => item.name)).toEqual(['Авто', 'Ёлка', 'Ящик']);
  });
});

describe('терминалы: признак выпущенного токена', () => {
  it('терминал с хешем токена показан как уже выпущенный', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedTerminal(firestore, 'term-1', {
      accessTokenHash: 'hash-value',
      tokenIssuedAt: Timestamp.fromDate(new Date('2026-09-20T10:00:00Z')),
    });

    const [view] = await service.list(director());

    expect(view.hasAccessToken).toBe(true);
    expect(view.tokenIssuedAt).toBe('2026-09-20T10:00:00.000Z');
  });

  it('хеш токена наружу не отдаётся', async () => {
    const { firestore, service } = setup();
    seedOffice(firestore, 'office-1');
    seedTerminal(firestore, 'term-1', { accessTokenHash: 'hash-value' });

    const [view] = await service.list(director());

    expect(view).not.toHaveProperty('accessTokenHash');
  });
});
