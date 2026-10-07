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
