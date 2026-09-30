import { OfficesService } from '../src/offices/offices.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const admin = {
  id: 'admin',
  organizationId: ORG,
  email: 'admin@corpsol.kz',
  role: 'SUPER_ADMIN',
  departmentId: null,
  officeId: null,
  deviceId: null,
} as AuthenticatedUser;

const base = {
  name: 'Головной офис',
  lat: 43.238949,
  lng: 76.889709,
  radiusMeters: 120,
};

function setup() {
  const firestore = new FakeFirestore();
  return { firestore, service: new OfficesService(fakeFirebase(firestore)) };
}

describe('адреса точек доступа при сохранении', () => {
  it('приводит к одному виду записи из разных источников', async () => {
    const { service } = setup();

    const office = await service.create(admin, {
      ...base,
      // Так копируют из роутера, так отдаёт телефон, так бывает без разделителей.
      wifiBssids: ['AA-BB-CC-DD-EE-FF', 'aa:bb:cc:dd:ee:01', '112233445566'],
    });

    expect(office.wifiBssids).toEqual([
      'aa:bb:cc:dd:ee:ff',
      'aa:bb:cc:dd:ee:01',
      '11:22:33:44:55:66',
    ]);
  });

  it('отклоняет опечатку в адресе', async () => {
    const { service } = setup();

    // Опечатка иначе тихо заблокировала бы отметку всему офису,
    // и причину искали бы долго.
    await expect(
      service.create(admin, { ...base, wifiBssids: ['aa:bb:cc'] }),
    ).rejects.toThrow(/MAC-адрес/);
  });

  it('пустой список оставляет только проверку по GPS', async () => {
    const { service } = setup();

    const office = await service.create(admin, { ...base, wifiBssids: [] });

    expect(office.wifiBssids).toEqual([]);
  });

  it('нормализует адреса и при изменении офиса', async () => {
    const { service } = setup();
    const office = await service.create(admin, { ...base, wifiBssids: [] });

    const updated = await service.update(admin, office.id, {
      wifiBssids: ['AA-BB-CC-DD-EE-FF'],
    });

    expect(updated.wifiBssids).toEqual(['aa:bb:cc:dd:ee:ff']);
  });
});

describe('умолчания и разделение организаций', () => {
  it('без явной погрешности ставит сотню метров', async () => {
    const { service } = setup();

    const office = await service.create(admin, base);

    expect(office.maxAccuracyMeters).toBe(100);
  });

  it('не отдаёт офис чужой организации', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.offices, 'alien', {
      organizationId: 'other-org',
      name: 'Чужой офис',
      lat: 0,
      lng: 0,
      radiusMeters: 120,
      maxAccuracyMeters: 100,
      wifiBssids: [],
    });

    await expect(service.findOne(admin, 'alien')).rejects.toThrow();
  });

  it('в списке только свои офисы', async () => {
    const { firestore, service } = setup();
    await service.create(admin, base);
    firestore.seed(COLLECTIONS.offices, 'alien', {
      organizationId: 'other-org',
      name: 'Чужой офис',
      lat: 0,
      lng: 0,
      radiusMeters: 120,
      maxAccuracyMeters: 100,
      wifiBssids: [],
    });

    const offices = await service.list(admin);

    expect(offices).toHaveLength(1);
    expect(offices[0].name).toBe('Головной офис');
  });
});
