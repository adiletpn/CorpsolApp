import { Timestamp } from 'firebase-admin/firestore';

import { NotificationsService } from '../src/notifications/notifications.service';
import { COLLECTIONS, notificationDocId } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new NotificationsService(fakeFirebase(firestore)) };
}

function seedUser(
  firestore: FakeFirestore,
  id: string,
  role: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    fullName: `Сотрудник ${id}`,
    role,
    status: 'ACTIVE',
    ...fields,
  });
}

const notify = (service: NotificationsService, userId: string, refId = 'req-1') =>
  service.notifyUser(userId, {
    organizationId: ORG,
    kind: 'device_rebind_requested',
    body: 'Асель Ким просит закрепить новый телефон',
    refType: 'DeviceRequest',
    refId,
  });

describe('создание уведомлений', () => {
  it('заголовок подставляется по виду события', async () => {
    const { firestore, service } = setup();

    await notify(service, 'hr-1');

    const [item] = await service.list('hr-1');
    expect(item.title).toBe('Заявка на смену телефона');
  });

  it('повторное событие не плодит копии', async () => {
    const { service } = setup();

    await notify(service, 'hr-1');
    await notify(service, 'hr-1');

    // Импорт и ретраи повторяют вызовы; список из десяти одинаковых
    // сообщений перестают читать вовсе.
    expect(await service.list('hr-1')).toHaveLength(1);
  });

  it('повтор не возвращает прочитанное обратно в непрочитанные', async () => {
    const { service } = setup();
    await notify(service, 'hr-1');
    const [item] = await service.list('hr-1');
    await service.markRead('hr-1', item.id);

    await notify(service, 'hr-1');

    expect(await service.unreadCount('hr-1')).toBe(0);
  });

  it('разные заявки приходят отдельными сообщениями', async () => {
    const { service } = setup();

    await notify(service, 'hr-1', 'req-1');
    await notify(service, 'hr-1', 'req-2');

    expect(await service.list('hr-1')).toHaveLength(2);
  });
});

describe('уведомление по роли', () => {
  it('получают все, кто носит роль', async () => {
    const { firestore, service } = setup();
    seedUser(firestore, 'hr-1', 'HR');
    seedUser(firestore, 'hr-2', 'HR');
    seedUser(firestore, 'mop-1', 'MOP');

    await service.notifyRole(ORG, ['HR'], {
      kind: 'device_rebind_requested',
      body: 'Заявка',
      refId: 'req-1',
    });

    expect(await service.list('hr-1')).toHaveLength(1);
    expect(await service.list('hr-2')).toHaveLength(1);
  });

  it('посторонние роли не получают ничего', async () => {
    const { firestore, service } = setup();
    seedUser(firestore, 'hr-1', 'HR');
    seedUser(firestore, 'mop-1', 'MOP');

    await service.notifyRole(ORG, ['HR'], {
      kind: 'device_rebind_requested',
      body: 'Заявка',
      refId: 'req-1',
    });

    // В заявке на чужой телефон видно имя и модель — это не для всех.
    expect(await service.list('mop-1')).toHaveLength(0);
  });

  it('уволенный ЧР уведомлений не получает', async () => {
    const { firestore, service } = setup();
    seedUser(firestore, 'hr-1', 'HR', { status: 'TERMINATED' });

    await service.notifyRole(ORG, ['HR'], {
      kind: 'device_rebind_requested',
      body: 'Заявка',
      refId: 'req-1',
    });

    expect(await service.list('hr-1')).toHaveLength(0);
  });

  it('чужая организация не видит событие', async () => {
    const { firestore, service } = setup();
    seedUser(firestore, 'hr-1', 'HR');
    seedUser(firestore, 'hr-foreign', 'HR', { organizationId: 'org-2' });

    await service.notifyRole(ORG, ['HR'], {
      kind: 'device_rebind_requested',
      body: 'Заявка',
      refId: 'req-1',
    });

    expect(await service.list('hr-foreign')).toHaveLength(0);
  });
});

describe('чтение', () => {
  it('свежие сверху', async () => {
    const { firestore, service } = setup();
    await notify(service, 'hr-1', 'req-1');
    await notify(service, 'hr-1', 'req-2');

    // Второе создано позже — поправим время, чтобы порядок был однозначным.
    firestore.seed(COLLECTIONS.notifications, notificationDocId('hr-1', 'device_rebind_requested', 'req-2'), {
      ...firestore.read(
        COLLECTIONS.notifications,
        notificationDocId('hr-1', 'device_rebind_requested', 'req-2'),
      ),
      createdAt: Timestamp.fromDate(new Date('2030-01-01T00:00:00Z')),
    });

    const list = await service.list('hr-1');
    expect(list[0].refId).toBe('req-2');
  });

  it('чужое уведомление прочитанным не отметить', async () => {
    const { service } = setup();
    await notify(service, 'hr-1');
    const [item] = await service.list('hr-1');

    await service.markRead('mop-1', item.id);

    // Идентификатор собран из понятных частей и угадывается,
    // а список — это личные данные.
    expect(await service.unreadCount('hr-1')).toBe(1);
  });

  it('отметка «прочитано всё» убирает счётчик', async () => {
    const { service } = setup();
    await notify(service, 'hr-1', 'req-1');
    await notify(service, 'hr-1', 'req-2');

    const marked = await service.markAllRead('hr-1');

    expect(marked).toBe(2);
    expect(await service.unreadCount('hr-1')).toBe(0);
  });

  it('пустой список не ломает отметку всего', async () => {
    const { service } = setup();

    expect(await service.markAllRead('hr-1')).toBe(0);
  });
});
