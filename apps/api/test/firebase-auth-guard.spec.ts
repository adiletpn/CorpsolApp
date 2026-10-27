import { createHmac } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseAuthGuard } from '../src/auth/firebase-auth.guard';
import { DevicesService } from '../src/devices/devices.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { FirebaseService } from '../src/firebase/firebase.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const BOT_TOKEN = '123456:guard-test';

/** Строка запуска, подписанная так же, как её подписывает Telegram. */
function initData(telegramId: number, token = BOT_TOKEN): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'Асель', username: 'asel' }),
  };
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function setup() {
  const firestore = new FakeFirestore();
  firestore.seed(COLLECTIONS.users, 'mop-1', {
    organizationId: 'org-1',
    email: 'mop-1@corpsol.kz',
    fullName: 'Асель Ким',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: null,
    hiredAt: Timestamp.now(),
    terminatedAt: null,
  });

  // Токен Firebase проверяет сам Firebase — здесь он всегда «настоящий».
  const firebase = {
    ...fakeFirebase(firestore),
    auth: { verifyIdToken: async () => ({ uid: 'mop-1' }) },
  } as unknown as FirebaseService;

  const devices = new DevicesService(firebase, new NotificationsService(firebase));
  return { firestore, guard: new FirebaseAuthGuard(new Reflector(), firebase, devices) };
}

function contextWith(headers: Record<string, string>) {
  const request: Record<string, unknown> = {
    headers: { authorization: 'Bearer token', ...headers },
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const previousToken = process.env.TELEGRAM_BOT_TOKEN;
beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
});
afterAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = previousToken;
});

describe('вход из мини-аппа', () => {
  it('подписанный аккаунт Telegram становится устройством', async () => {
    const { guard, firestore } = setup();
    const { context, request } = contextWith({ 'x-telegram-init-data': initData(42) });

    await guard.canActivate(context);

    expect((request.user as { deviceId: string }).deviceId).toBe('telegram-42');
    // В панели «Устройства» видно, какой Telegram закреплён.
    const bound = firestore.all(COLLECTIONS.devices);
    expect(bound).toEqual([expect.objectContaining({ userId: 'mop-1', model: '@asel' })]);
  });

  it('чужой Telegram на закреплённом аккаунте — отказ', async () => {
    const { guard } = setup();
    await guard.canActivate(contextWith({ 'x-telegram-init-data': initData(42) }).context);

    await expect(
      guard.canActivate(contextWith({ 'x-telegram-init-data': initData(7) }).context),
    ).rejects.toMatchObject({ response: { code: 'device_mismatch' } });
  });

  it('строка, подписанная не нашим ботом, отклоняется', async () => {
    const { guard } = setup();
    const { context } = contextWith({ 'x-telegram-init-data': initData(42, '999:other') });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('без токена бота сервер говорит, что вход не настроен', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { guard } = setup();
    const { context } = contextWith({ 'x-telegram-init-data': initData(42) });

    // Не «неверная подпись»: ошибка конфигурации сервера, а не сотрудника.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('без Telegram и без телефона менеджера не пускают', async () => {
    const { guard } = setup();

    await expect(guard.canActivate(contextWith({}).context)).rejects.toMatchObject({
      response: { code: 'device_required' },
    });
  });
});
