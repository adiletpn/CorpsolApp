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

describe('существующая запись не затирается', () => {
  const seedDay = (firestore: FakeFirestore, fields: Record<string, unknown>) => {
    firestore.seed(COLLECTIONS.attendance, attendanceDocId('mop-1', WORK_DATE), {
      userId: 'mop-1',
      organizationId: ORG,
      departmentId: 'dep-1',
      workDate: WORK_DATE,
      lateMinutes: 0,
      method: 'QR',
      createdAt: Timestamp.now(),
      ...fields,
    });
  };

  const ready = () => {
    const context = setup();
    seedEmployee(context.firestore, 'mop-1');
    seedSchedule(context.firestore);
    return context;
  };

  it('отметка прихода остаётся на месте', async () => {
    const { firestore, service } = ready();
    seedDay(firestore, { status: 'ON_TIME' });

    const result = await service.markForOrganization(ORG, WORK_DATE);

    // Человек пришёл и отметился — ночная задача не вправе это переписать.
    expect(result.marked).toBe(0);
    expect(recordOf(firestore, 'mop-1')?.status).toBe('ON_TIME');
  });

  it('опоздание не превращается в прогул', async () => {
    const { firestore, service } = ready();
    seedDay(firestore, { status: 'LATE', lateMinutes: 25 });

    await service.markForOrganization(ORG, WORK_DATE);

    expect(recordOf(firestore, 'mop-1')?.status).toBe('LATE');
    expect(recordOf(firestore, 'mop-1')?.lateMinutes).toBe(25);
  });

  it('уважительная причина не перебивается прогулом', async () => {
    const { firestore, service } = ready();
    seedDay(firestore, { status: 'EXCUSED', method: 'MANUAL_ADJUSTMENT' });

    // Руководитель уже разобрался с этим днём. Переписать его значит
    // обесценить ручную правку и вернуть штраф.
    await service.markForOrganization(ORG, WORK_DATE);

    expect(recordOf(firestore, 'mop-1')?.status).toBe('EXCUSED');
  });

  it('выходной остаётся выходным', async () => {
    const { firestore, service } = ready();
    seedDay(firestore, { status: 'DAY_OFF', method: 'MANUAL_ADJUSTMENT' });

    await service.markForOrganization(ORG, WORK_DATE);

    expect(recordOf(firestore, 'mop-1')?.status).toBe('DAY_OFF');
  });

  it('повторный прогон не плодит записи', async () => {
    const { firestore, service } = ready();

    await service.markForOrganization(ORG, WORK_DATE);
    const second = await service.markForOrganization(ORG, WORK_DATE);

    // Задача ночная и может запуститься дважды — например, после перезапуска.
    expect(second.marked).toBe(0);
    expect(firestore.all(COLLECTIONS.attendance)).toHaveLength(1);
  });
});

describe('срок работы сотрудника', () => {
  it('принятому позже прогул за прошлое не ставится', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-new', {
      hiredAt: Timestamp.fromDate(new Date('2026-09-20T00:00:00Z')),
    });
    seedSchedule(firestore);

    // Человека ещё не было в компании — прогул за этот день абсурден.
    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
  });

  it('в день приёма прогул возможен', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1', {
      hiredAt: Timestamp.fromDate(new Date(`${WORK_DATE}T00:00:00Z`)),
    });
    seedSchedule(firestore);

    // Первый рабочий день — уже рабочий.
    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(1);
  });

  it('уволенный в выборку не попадает вовсе', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-fired', {
      status: 'TERMINATED',
      terminatedAt: Timestamp.fromDate(new Date('2026-08-31T00:00:00Z')),
    });
    seedSchedule(firestore);

    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
  });

  it('сотрудники чужой организации не трогаются', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'alien', { organizationId: 'other-org' });
    seedSchedule(firestore);

    const result = await service.markForOrganization(ORG, WORK_DATE);

    expect(result.marked).toBe(0);
    expect(recordOf(firestore, 'alien')).toBeUndefined();
  });
});

describe('что записывается в табель', () => {
  const marked = async () => {
    const context = setup();
    seedEmployee(context.firestore, 'mop-1');
    seedSchedule(context.firestore);
    await context.service.markForOrganization(ORG, WORK_DATE);
    return context;
  };

  it('помечается как вывод системы, а не отметка человека', async () => {
    const { firestore } = await marked();

    // В отчётах такой день должен отличаться и от скана, и от правки руками.
    expect(recordOf(firestore, 'mop-1')?.method).toBe('AUTO_ABSENCE');
  });

  it('времени прихода нет', async () => {
    const { firestore } = await marked();

    expect(recordOf(firestore, 'mop-1')?.checkInAt).toBeNull();
    expect(recordOf(firestore, 'mop-1')?.checkOutAt).toBeNull();
  });

  it('следов проверки местоположения нет', async () => {
    const { firestore } = await marked();

    // Никто ничего не сканировал — проставлять координаты значит солгать.
    const record = recordOf(firestore, 'mop-1');
    expect(record?.lat).toBeNull();
    expect(record?.terminalId).toBeNull();
    expect(record?.distanceMeters).toBeNull();
  });

  it('автором правки никто не числится', async () => {
    const { firestore } = await marked();

    // Прогул поставила система, а не руководитель: приписывать его
    // человеку означало бы подставить его при разборе.
    expect(recordOf(firestore, 'mop-1')?.adjustedBy).toBeNull();
    expect(recordOf(firestore, 'mop-1')?.adjustNote).toBeNull();
  });

  it('отдел и офис копируются из карточки', async () => {
    const { firestore } = await marked();

    // Firestore не умеет join: без копии отчёты по отделу день не найдут.
    expect(recordOf(firestore, 'mop-1')?.departmentId).toBe('dep-1');
    expect(recordOf(firestore, 'mop-1')?.officeId).toBe('office-1');
  });

  it('минут опоздания ноль, а не пусто', async () => {
    const { firestore } = await marked();

    // Расчёт зарплаты складывает это поле — undefined сломал бы сумму.
    expect(recordOf(firestore, 'mop-1')?.lateMinutes).toBe(0);
  });
});

describe('прогон по всем организациям', () => {
  /** Вторая организация в поясе, который на пять часов позади. */
  const twoOrganizations = () => {
    const context = setup();
    context.firestore.seed(COLLECTIONS.organizations, 'org-2', {
      name: 'Вторая',
      timezone: 'Europe/Lisbon',
    });

    seedEmployee(context.firestore, 'mop-1');
    seedEmployee(context.firestore, 'mop-2', { organizationId: 'org-2' });
    seedSchedule(context.firestore);
    return context;
  };

  it('обходит каждую организацию', async () => {
    const { service } = twoOrganizations();

    const results = await service.markYesterdayEverywhere(
      new Date('2026-09-16T10:00:00Z'),
    );

    expect(results).toHaveLength(2);
  });

  it('дата считается по поясу организации', async () => {
    const { service } = twoOrganizations();

    // 16 сентября 02:00 по UTC: в Алматы это уже 07:00 шестнадцатого,
    // значит «вчера» — пятнадцатое. В Лиссабоне ещё 01:00 шестнадцатого,
    // «вчера» там тоже пятнадцатое, но граница проходит иначе.
    const results = await service.markYesterdayEverywhere(
      new Date('2026-09-16T02:00:00Z'),
    );

    const almaty = results.find((item) => item.organizationId === ORG);
    expect(almaty?.workDate).toBe('2026-09-15');
  });

  it('сбой в одной организации не срывает остальные', async () => {
    const { firestore, service } = twoOrganizations();
    // Организация без часового пояса и без сотрудников — прогон по ней
    // не должен мешать первым двум.
    firestore.seed(COLLECTIONS.organizations, 'org-broken', { name: 'Сломанная' });

    const results = await service.markYesterdayEverywhere(
      new Date('2026-09-16T10:00:00Z'),
    );

    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('считает, сколько человек должно было выйти', async () => {
    const { firestore, service } = setup();
    seedEmployee(firestore, 'mop-1');
    seedEmployee(firestore, 'mop-2');
    seedEmployee(firestore, 'mop-3');
    seedSchedule(firestore);
    firestore.seed(COLLECTIONS.attendance, attendanceDocId('mop-3', WORK_DATE), {
      userId: 'mop-3',
      organizationId: ORG,
      workDate: WORK_DATE,
      status: 'ON_TIME',
      lateMinutes: 0,
      method: 'QR',
      createdAt: Timestamp.now(),
    });

    const result = await service.markForOrganization(ORG, WORK_DATE);

    // Трое должны были выйти, двое не вышли.
    expect(result.expected).toBe(3);
    expect(result.marked).toBe(2);
  });
});
