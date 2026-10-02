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

describe('опоздание считается по графику, а не со слов', () => {
  it('поздний приход остаётся опозданием, даже если просят «вовремя»', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('09:40'),
      status: 'ON_TIME',
      reason: 'Просили поставить вовремя',
    });

    // Иначе правка табеля превращается в способ списать опоздания.
    expect(result.status).toBe('LATE');
    expect(result.lateMinutes).toBe(35);
  });

  it('приход внутри допуска считается вовремя', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('09:05'),
      reason: 'Сбой терминала',
    });

    expect(result.status).toBe('ON_TIME');
    expect(result.lateMinutes).toBe(0);
  });

  it('минута сверх допуска уже опоздание', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('09:06'),
      reason: 'Сбой терминала',
    });

    expect(result.status).toBe('LATE');
    expect(result.lateMinutes).toBe(1);
  });

  it('ранний приход опозданием не считается', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('08:30'),
      reason: 'Сбой терминала',
    });

    // Отрицательных минут опоздания быть не может.
    expect(result.status).toBe('ON_TIME');
    expect(result.lateMinutes).toBe(0);
  });

  it('личный график имеет приоритет над отдельским', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);
    firestore.seed(COLLECTIONS.workSchedules, 'schedule-personal', {
      departmentId: null,
      userId: 'mop-1',
      startTime: '11:00',
      endTime: '20:00',
      graceMinutes: 5,
      workdays: [1, 2, 3, 4, 5],
      effectiveFrom: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),
      effectiveTo: null,
    });

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('10:30'),
      reason: 'Сбой терминала',
    });

    // По графику отдела это опоздание на полтора часа, по личному — приход раньше.
    expect(result.status).toBe('ON_TIME');
  });
});

describe('дни без прихода', () => {
  it('без времени прихода день считается прогулом', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      reason: 'Не вышел на смену',
    });

    expect(result.status).toBe('ABSENT');
    expect(result.lateMinutes).toBe(0);
  });

  it('уважительная причина проставляется явно', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      status: 'EXCUSED',
      reason: 'Больничный лист',
    });

    expect(result.status).toBe('EXCUSED');
  });

  it('уважительная причина не даёт опоздания даже при позднем приходе', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('14:00'),
      status: 'EXCUSED',
      reason: 'Приём у врача по согласованию',
    });

    // Согласованный поздний приход — не опоздание, иначе штраф за визит к врачу.
    expect(result.status).toBe('EXCUSED');
    expect(result.lateMinutes).toBe(0);
  });

  it('выходной остаётся выходным', async () => {
    const { firestore, service } = setup();
    seedSchedule(firestore);

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('12:00'),
      status: 'DAY_OFF',
      reason: 'Зашёл за документами в выходной',
    });

    expect(result.status).toBe('DAY_OFF');
    expect(result.lateMinutes).toBe(0);
  });

  it('приход в нерабочий день графика не становится опозданием', async () => {
    const { firestore, service } = setup();
    // 15 сентября 2026 — вторник, исключаем его из рабочих дней.
    seedSchedule(firestore, { workdays: [1, 3, 4, 5] });

    const result = await service.adjust(actor('ROP'), 'mop-1', {
      workDate: WORK_DATE,
      checkInAt: almaty('13:00'),
      reason: 'Вышел подменить коллегу',
    });

    expect(result.status).toBe('DAY_OFF');
    expect(result.lateMinutes).toBe(0);
  });
});
