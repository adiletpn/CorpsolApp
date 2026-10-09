import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { IntegrationsService } from '../src/calls/integrations.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const WEBHOOK = 'https://corpsol.bitrix24.kz/rest/1/s3cr3ttok3n';

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new IntegrationsService(fakeFirebase(firestore)) };
}

const admin = (organizationId = ORG): AuthenticatedUser => ({
  id: 'admin-1',
  organizationId,
  email: 'admin@corpsol.kz',
  role: 'SUPER_ADMIN',
  departmentId: null,
  officeId: null,
  deviceId: null,
});

function seedIntegration(
  firestore: FakeFirestore,
  organizationId = ORG,
  fields: Record<string, unknown> = {},
): void {
  firestore.seed(COLLECTIONS.integrations, `${organizationId}_BITRIX`, {
    organizationId,
    provider: 'BITRIX',
    isActive: true,
    webhookUrl: WEBHOOK,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    syncedUpTo: null,
    ...fields,
  });
}

describe('интеграции: подключение Bitrix', () => {
  it('адрес не того вида отклоняется', async () => {
    const { service } = setup();

    await expect(
      service.connectBitrix(admin(), 'https://example.com/webhook'),
    ).rejects.toThrow(BadRequestException);
  });

  it('пустая строка не проходит за адрес', async () => {
    const { service } = setup();

    await expect(service.connectBitrix(admin(), '   ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('косая черта в конце не создаёт вторую интеграцию', async () => {
    const { firestore, service } = setup();

    await service.connectBitrix(admin(), `${WEBHOOK}/`);

    expect(firestore.read(COLLECTIONS.integrations, `${ORG}_BITRIX`)?.webhookUrl).toBe(
      WEBHOOK,
    );
  });
});

describe('интеграции: адрес вебхука наружу не уходит', () => {
  it('ответ после подключения содержит только маску', async () => {
    const { service } = setup();

    const view = await service.connectBitrix(admin(), WEBHOOK);

    expect(view).not.toHaveProperty('webhookUrl');
    expect(JSON.stringify(view)).not.toContain('s3cr3ttok3n');
    expect(view.webhookMasked).toBeTruthy();
  });

  it('в списке для панели токена тоже нет', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore);

    const [view] = await service.list(admin());

    expect(JSON.stringify(view)).not.toContain('s3cr3ttok3n');
  });
});

describe('интеграции: доступ к адресу изнутри', () => {
  it('ненастроенная интеграция не отдаёт адрес', async () => {
    const { service } = setup();

    await expect(service.requireWebhook(ORG)).rejects.toThrow(NotFoundException);
  });

  it('отключённая интеграция адрес не отдаёт', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore, ORG, { isActive: false });

    await expect(service.requireWebhook(ORG)).rejects.toThrow(NotFoundException);
  });

  it('настроенная отдаёт адрес целиком — им ходят в портал', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore);

    expect(await service.requireWebhook(ORG)).toBe(WEBHOOK);
  });
});

describe('интеграции: отключение', () => {
  it('токен стирается, а не просто гасится признак', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore);

    await service.disconnect(admin(), 'BITRIX');

    const doc = firestore.read(COLLECTIONS.integrations, `${ORG}_BITRIX`);
    expect(doc?.isActive).toBe(false);
    expect(doc?.webhookUrl).toBeNull();
  });

  it('после отключения адрес не выдаётся', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore);
    await service.disconnect(admin(), 'BITRIX');

    await expect(service.requireWebhook(ORG)).rejects.toThrow(NotFoundException);
  });
});

describe('интеграции: чужие организации', () => {
  it('в списке видна только своя интеграция', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore, ORG);
    seedIntegration(firestore, OTHER_ORG);

    const list = await service.list(admin());

    expect(list).toHaveLength(1);
  });

  it('адрес чужой организации не достать', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore, OTHER_ORG);

    await expect(service.requireWebhook(ORG)).rejects.toThrow(NotFoundException);
  });
});

describe('интеграции: отметка синхронизации', () => {
  it('успех записывает время и стирает прошлую ошибку', async () => {
    const { firestore, service } = setup();
    seedIntegration(firestore, ORG, { lastSyncError: 'прошлый сбой' });

    await service.recordSync(ORG, 'BITRIX', 'OK', {
      syncedUpTo: new Date('2026-10-09T10:00:00Z'),
    });

    const doc = firestore.read(COLLECTIONS.integrations, `${ORG}_BITRIX`);
    expect(doc?.lastSyncStatus).toBe('OK');
    expect(doc?.lastSyncError).toBeNull();
    expect((doc?.syncedUpTo as Timestamp).toDate().toISOString()).toBe(
      '2026-10-09T10:00:00.000Z',
    );
  });

  it('сбой не сдвигает точку доборной синхронизации', async () => {
    const { firestore, service } = setup();
    const point = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));
    seedIntegration(firestore, ORG, { syncedUpTo: point });

    await service.recordSync(ORG, 'BITRIX', 'FAILED', { error: 'портал недоступен' });

    const doc = firestore.read(COLLECTIONS.integrations, `${ORG}_BITRIX`);
    expect(doc?.lastSyncError).toBe('портал недоступен');
    // Иначе после сбоя часть звонков была бы пропущена навсегда.
    expect(doc?.syncedUpTo).toBe(point);
  });
});
