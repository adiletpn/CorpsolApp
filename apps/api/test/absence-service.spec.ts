import { Timestamp } from 'firebase-admin/firestore';

import { AbsenceService } from '../src/attendance/absence.service';
import { COLLECTIONS, attendanceDocId } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
/** 15 сентября 2026 — вторник. */
const WORK_DATE = '2026-09-15';

function setup() {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.organizations, ORG, {
    name: 'CorpSol',
    timezone: 'Asia/Almaty',
  });

  return { firestore, service: new AbsenceService(fakeFirebase(firestore)) };
}

function seedEmployee(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.users, id, {
    organizationId: ORG,
    fullName: `Сотрудник ${id}`,
    email: `${id}@corpsol.kz`,
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: 'office-1',
    hiredAt: Timestamp.fromDate(new Date('2026-01-10T00:00:00Z')),
    terminatedAt: null,
    baseSalaryMinor: 0,
    currency: 'KZT',
    ...fields,
  });
}

/** График отдела: будни с 09:00. */
function seedSchedule(firestore: FakeFirestore, fields: Record<string, unknown> = {}) {
  firestore.seed(COLLECTIONS.workSchedules, `schedule-${Math.random()}`, {
    departmentId: 'dep-1',
    userId: null,
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 5,
    workdays: [1, 2, 3, 4, 5],
    effectiveFrom: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),
    effectiveTo: null,
    ...fields,
  });
}

const recordOf = (firestore: FakeFirestore, userId: string) =>
  firestore.read(COLLECTIONS.attendance, attendanceDocId(userId, WORK_DATE));

describe('кому ставится прогул', () => {
  it('невышедшему в рабочий день по графику', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedSchedule(firestore);

    const result = await service.markForOrganization(ORG, WORK_DATE);

    // Без этого невыход ничем не отличается от выходного:
    // дня в табеле просто нет, и в расчёт зарплаты он не попадает.
    expect(result.marked).toBe(1);
    expect(recordOf(firestore, 'mop-1')?.status).toBe('ABSENT');
  });

  it('не ставится без графика', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');

    // Мы не знаем, должен ли человек был выйти. Наказывать по догадке нельзя.
    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
    expect(recordOf(firestore, 'mop-1')).toBeUndefined();
  });

  it('не ставится в нерабочий день графика', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    // Вторник исключён из рабочих дней.
    seedSchedule(firestore, { workdays: [1, 3, 4, 5] });

    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
  });

  it('директору и кадровику прогулы не ставятся', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'dir-1', { role: 'DIRECTOR' });
    seedEmployee(firestore, 'hr-1', { role: 'HR' });
    seedSchedule(firestore);

    // У них нет смен в табеле, и прогул для них бессмыслен.
    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
  });

  it('руководителю отдела ставится наравне с менеджером', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'rop-1', { role: 'ROP' });
    seedSchedule(firestore);

    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(1);
  });
});
