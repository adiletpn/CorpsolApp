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
