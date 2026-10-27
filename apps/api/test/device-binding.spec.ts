import type { Role } from '@corpsol/shared';

import { DevicesService } from '../src/devices/devices.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { UserDoc } from '../src/firestore/types';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const user = (role: Role): UserDoc => ({ role, status: 'ACTIVE' }) as unknown as UserDoc;

const phone = (deviceId: string) => ({ deviceId, platform: 'ios' });

function service() {
  const firebase = fakeFirebase(new FakeFirestore());
  return new DevicesService(firebase, new NotificationsService(firebase));
}

describe('кто обязан предъявлять телефон', () => {
  it('менеджер без телефона не проходит', async () => {
    await expect(service().resolveForRequest('u1', user('MOP'))).rejects.toThrow();
  });

  it('руководитель отдела заходит в панель без телефона', async () => {
    // Основная работа РОПа — в панели, а браузер телефон не предъявляет.
    await expect(service().resolveForRequest('u1', user('ROP'))).resolves.toBeNull();
  });

  it('директор, ЧР и админ заходят без телефона', async () => {
    const devices = service();
    for (const role of ['DIRECTOR', 'HR', 'SUPER_ADMIN'] as Role[]) {
      await expect(devices.resolveForRequest('u1', user(role))).resolves.toBeNull();
    }
  });
});

describe('привязка для тех, кто телефон предъявил', () => {
  it('закрепляет телефон за руководителем отдела при первом входе с него', async () => {
    const devices = service();

    const bound = await devices.resolveForRequest('rop-1', user('ROP'), phone('rop-phone'));

    // Отметка прихода потребует именно этот телефон.
    expect(bound?.deviceId).toBe('rop-phone');
  });

  it('не пускает руководителя с чужого телефона после привязки', async () => {
    const devices = service();
    await devices.resolveForRequest('rop-1', user('ROP'), phone('rop-phone'));

    await expect(
      devices.resolveForRequest('rop-1', user('ROP'), phone('other-phone')),
    ).rejects.toThrow();
  });

  it('не даёт закрепить один телефон за двумя сотрудниками', async () => {
    const devices = service();
    await devices.resolveForRequest('mop-1', user('MOP'), phone('shared-phone'));

    await expect(
      devices.resolveForRequest('mop-2', user('MOP'), phone('shared-phone')),
    ).rejects.toThrow();
  });
});

describe('заявка на смену Telegram', () => {
  it('HR видит в уведомлении, что просят закрепить Telegram, а не телефон', async () => {
    const firestore = new FakeFirestore();
    const firebase = fakeFirebase(firestore);
    const devices = new DevicesService(firebase, new NotificationsService(firebase));
    firestore.seed(COLLECTIONS.users, 'mop-1', { organizationId: 'org-1', fullName: 'Асель Ким', role: 'MOP', status: 'ACTIVE' });
    firestore.seed(COLLECTIONS.users, 'hr-1', { organizationId: 'org-1', fullName: 'ЧР', role: 'HR', status: 'ACTIVE' });

    await devices.resolveForRequest('mop-1', user('MOP'), { deviceId: 'telegram-1', platform: 'telegram-ios' });
    await expect(
      devices.resolveForRequest('mop-1', user('MOP'), {
        deviceId: 'telegram-2',
        platform: 'telegram-macos',
        model: '@asel_work',
      }),
    ).rejects.toThrow();

    const [notification] = firestore.all(COLLECTIONS.notifications);
    // «@asel_work» без пояснения HR не понял бы.
    expect(notification.body).toBe('Асель Ким просит закрепить Telegram · Mac @asel_work');
  });
});
