import { Timestamp } from 'firebase-admin/firestore';

import { AttendanceAdjustmentService } from '../src/attendance/adjustment.service';
import { COLLECTIONS, attendanceDocId } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const WORK_DATE = '2026-09-15';

const actor = (
  role: AuthenticatedUser['role'],
  id = 'rop-1',
  extra: Partial<AuthenticatedUser> = {},
) =>
  ({
    id,
    organizationId: ORG,
    email: `${id}@corpsol.kz`,
    role,
    departmentId: 'dep-1',
    officeId: null,
    deviceId: null,
    ...extra,
  }) as AuthenticatedUser;

function setup() {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.organizations, ORG, {
    name: 'CorpSol',
    timezone: 'Asia/Almaty',
  });

  firestore.seed(COLLECTIONS.users, 'mop-1', {
    organizationId: ORG,
    fullName: 'Болат Сериков',
    email: 'mop-1@corpsol.kz',
    role: 'MOP',
    status: 'ACTIVE',
    departmentId: 'dep-1',
    officeId: 'office-1',
    baseSalaryMinor: 0,
  });

  return {
    firestore,
    service: new AttendanceAdjustmentService(fakeFirebase(firestore)),
  };
}

/** График отдела: смена с 09:00, допуск пять минут, будни. */
function seedSchedule(firestore: FakeFirestore, fields: Record<string, unknown> = {}) {
  firestore.seed(COLLECTIONS.workSchedules, 'schedule-dep', {
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

/** Время по Алматы (UTC+5) в момент указанного местного часа. */
const almaty = (time: string) => `2026-09-15T${time}:00+05:00`;

describe('кто вправе править табель', () => {
  it('руководитель правит своего подчинённого', async () => {
    const { service } = setup();

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      reason: 'Сбой терминала',
    });

    expect(result.id).toBe(attendanceDocId('mop-1', WORK_DATE));
  });

  it('нельзя править собственный табель', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'rop-1', {
      organizationId: ORG,
      fullName: 'Руководитель',
      email: 'rop-1@corpsol.kz',
      role: 'ROP',
      status: 'ACTIVE',
      departmentId: 'dep-1',
      officeId: null,
      baseSalaryMinor: 0,
    });

    // Иначе руководитель закрывал бы собственные опоздания.
    await expect(
      service.adjust(actor('ROP'), 'rop-1', { workDate: WORK_DATE, reason: 'Опоздал' }),
    ).rejects.toThrow(/собственный табель/);
  });

  it('руководитель не трогает чужой отдел', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'mop-2', {
      organizationId: ORG,
      fullName: 'Чужой подчинённый',
      email: 'mop-2@corpsol.kz',
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: 'dep-2',
      officeId: null,
      baseSalaryMinor: 0,
    });

    await expect(
      service.adjust(actor('ROP'), 'mop-2', { workDate: WORK_DATE, reason: 'Просьба' }),
    ).rejects.toThrow(/не из вашего отдела/);
  });

  it('директор правит любой отдел', async () => {
    const { service } = setup();

    const result = await service.adjust(
      actor('DIRECTOR', 'dir-1', { departmentId: null }),
      'mop-1',
      { workDate: WORK_DATE, reason: 'Командировка' },
    );

    expect(result.id).toBe(attendanceDocId('mop-1', WORK_DATE));
  });

  it('сотрудник чужой организации не найден', async () => {
    const { firestore, service } = setup();
    firestore.seed(COLLECTIONS.users, 'alien', {
      organizationId: 'other-org',
      fullName: 'Чужой',
      email: 'alien@other.kz',
      role: 'MOP',
      status: 'ACTIVE',
      departmentId: 'dep-1',
      officeId: null,
      baseSalaryMinor: 0,
    });

    await expect(
      service.adjust(actor('DIRECTOR', 'dir-1', { departmentId: null }), 'alien', {
        workDate: WORK_DATE,
        reason: 'Проверка',
      }),
    ).rejects.toThrow(/не найден/);
  });
});
