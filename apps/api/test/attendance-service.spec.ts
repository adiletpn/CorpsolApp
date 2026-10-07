import { Timestamp } from 'firebase-admin/firestore';
import { parseQrPayload } from '@corpsol/shared';

import { AttendanceService } from '../src/attendance/attendance.service';
import { TerminalService } from '../src/attendance/terminal.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const TERMINAL = 'terminal-1';
const OFFICE = 'office-1';
const SECRET = TerminalService.generateSecret();

/** Координаты офиса и точка в двух шагах от него. */
const OFFICE_POINT = { lat: 43.238949, lng: 76.889709 };

function setup(officeFields: Record<string, unknown> = {}) {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.organizations, ORG, { name: 'CorpSol', timezone: 'Asia/Almaty' });

  firestore.seed(COLLECTIONS.offices, OFFICE, {
    organizationId: ORG,
    name: 'Главный офис',
    ...OFFICE_POINT,
    radiusMeters: 150,
    maxAccuracyMeters: 50,
    wifiBssids: [],
    ...officeFields,
  });

  firestore.seed(COLLECTIONS.terminals, TERMINAL, {
    officeId: OFFICE,
    name: 'Терминал у входа',
    secret: SECRET,
    isActive: true,
    accessTokenHash: null,
    tokenIssuedAt: null,
    createdAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
  });

  const firebase = fakeFirebase(firestore);
  const terminals = new TerminalService(firebase);

  return { firestore, terminals, service: new AttendanceService(firebase, terminals) };
}

function seedEmployee(firestore: FakeFirestore, fields: Record<string, unknown> = {}): void {
  firestore.seed(COLLECTIONS.users, 'uid-1', {
    organizationId: ORG,
    fullName: 'Асель Ким',
    email: 'uid-1@corpsol.kz',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: OFFICE,
    hiredAt: Timestamp.fromDate(new Date('2026-01-10T00:00:00Z')),
    terminatedAt: null,
    baseSalaryMinor: 0,
    currency: 'KZT',
    ...fields,
  });
}

const actor = (fields: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'uid-1',
  organizationId: ORG,
  email: 'uid-1@corpsol.kz',
  role: 'MOP',
  departmentId: 'dep-1',
  officeId: OFFICE,
  deviceId: 'phone-1',
  ...fields,
});

/** Живой код терминала — его отдаёт экран в офисе. */
async function freshQr(terminals: TerminalService): Promise<string> {
  const { payload } = await terminals.issueCode(TERMINAL);
  return payload;
}

const dtoAt = (qr: string, over: Record<string, unknown> = {}) => ({
  qr,
  ...OFFICE_POINT,
  accuracyMeters: 10,
  isMocked: false,
  ...over,
});

describe('отметка прихода: телефон', () => {
  it('без предъявленного телефона отметка не засчитывается', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    await expect(
      service.checkIn(actor({ deviceId: null }), dtoAt(qr) as never),
    ).rejects.toMatchObject({ response: { code: 'device_not_bound' } });
  });
});

describe('отметка прихода: статус сотрудника', () => {
  it('уволенный сотрудник отметиться не может', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore, { status: 'TERMINATED' });
    const qr = await freshQr(terminals);

    await expect(service.checkIn(actor(), dtoAt(qr) as never)).rejects.toMatchObject({
      response: { code: 'employee_inactive' },
    });
  });

  it('отметка от несуществующей карточки отклоняется', async () => {
    const { terminals, service } = setup();
    const qr = await freshQr(terminals);

    await expect(service.checkIn(actor(), dtoAt(qr) as never)).rejects.toMatchObject({
      response: { code: 'employee_inactive' },
    });
  });
});

describe('отметка прихода: код терминала', () => {
  it('мусор вместо кода не проходит разбор', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore);

    await expect(
      service.checkIn(actor(), dtoAt('не-код-вовсе') as never),
    ).rejects.toMatchObject({ response: { code: 'qr_invalid' } });
  });

  it('код с подменённой подписью не принимается', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);
    const parsed = parseQrPayload(qr)!;
    const forged = JSON.stringify({ ...parsed, s: 'подделка' });

    await expect(service.checkIn(actor(), dtoAt(forged) as never)).rejects.toMatchObject({
      response: { code: 'qr_invalid' },
    });
  });
});

describe('отметка прихода: геозона', () => {
  it('из дома отметиться нельзя, в ответе расстояние до офиса', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    await expect(
      service.checkIn(actor(), dtoAt(qr, { lat: 43.26, lng: 76.95 }) as never),
    ).rejects.toMatchObject({
      response: { code: 'outside_fence', radiusMeters: 150 },
    });
  });

  it('недостоверная точность трактуется не в пользу сотрудника', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    await expect(
      service.checkIn(actor(), dtoAt(qr, { accuracyMeters: 500 }) as never),
    ).rejects.toThrow();
  });
});

describe('отметка прихода: подменённая геолокация', () => {
  it('флаг подмены координат отменяет отметку, даже если точка верная', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    await expect(
      service.checkIn(actor(), dtoAt(qr, { isMocked: true }) as never),
    ).rejects.toThrow();
  });
});

describe('отметка прихода: офисный Wi-Fi', () => {
  it('без офисной сети отметка не проходит, если сеть задана', async () => {
    const { firestore, terminals, service } = setup({ wifiBssids: ['A1:B2:C3:D4:E5:F6'] });
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    await expect(
      service.checkIn(actor(), dtoAt(qr, { wifiBssid: 'FF:FF:FF:FF:FF:FF' }) as never),
    ).rejects.toMatchObject({ response: { code: 'outside_fence' } });
  });

  it('пустой список сетей проверку по Wi-Fi отключает', async () => {
    const { firestore, terminals, service } = setup({ wifiBssids: [] });
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    const result = await service.checkIn(actor(), dtoAt(qr) as never);

    expect(result.status).toBe('ON_TIME');
  });
});

describe('отметка прихода: запись сетей в разном виде', () => {
  it('роутер и телефон пишут адрес по-разному, но сеть та же', async () => {
    const { firestore, terminals, service } = setup({ wifiBssids: ['A1:B2:C3:D4:E5:F6'] });
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    const result = await service.checkIn(
      actor(),
      dtoAt(qr, { wifiBssid: 'a1-b2-c3-d4-e5-f6' }) as never,
    );

    expect(result.status).toBe('ON_TIME');
  });
});

describe('отметка прихода: засчитанная отметка', () => {
  it('запись содержит офис, терминал и способ отметки', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    const qr = await freshQr(terminals);

    const result = await service.checkIn(actor(), dtoAt(qr) as never);

    expect(result.office).toEqual({ id: OFFICE, name: 'Главный офис' });
    expect(firestore.read(COLLECTIONS.attendance, result.id)).toMatchObject({
      userId: 'uid-1',
      officeId: OFFICE,
      terminalId: TERMINAL,
      method: 'QR',
      checkOutAt: null,
    });
  });
});

describe('отметка прихода: повторный скан', () => {
  it('второй скан за тот же день отвергается самой базой', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    await service.checkIn(actor(), dtoAt(await freshQr(terminals)) as never);

    await expect(
      service.checkIn(actor(), dtoAt(await freshQr(terminals)) as never),
    ).rejects.toMatchObject({ response: { code: 'already_checked_in' } });
  });

  it('повторный скан не плодит вторую запись за день', async () => {
    const { firestore, terminals, service } = setup();
    seedEmployee(firestore);
    await service.checkIn(actor(), dtoAt(await freshQr(terminals)) as never);
    await expect(
      service.checkIn(actor(), dtoAt(await freshQr(terminals)) as never),
    ).rejects.toThrow();

    expect(firestore.all(COLLECTIONS.attendance)).toHaveLength(1);
  });
});
