import { Timestamp } from 'firebase-admin/firestore';

import { findActiveSchedule } from '../src/schedules/schedule-resolver';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore } from './fake-firestore';

const AT = new Date('2026-09-15T09:00:00Z');

function seedSchedule(
  firestore: FakeFirestore,
  id: string,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.workSchedules, id, {
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

const resolve = (firestore: FakeFirestore, departmentId: string | null = 'dep-1') =>
  findActiveSchedule(firestore as never, 'mop-1', departmentId, AT);

describe('какой график действует', () => {
  it('без графиков возвращает ничего', async () => {
    const firestore = new FakeFirestore();

    await expect(resolve(firestore)).resolves.toBeNull();
  });

  it('берёт график отдела', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'dep-schedule');

    const schedule = await resolve(firestore);

    expect(schedule?.startTime).toBe('09:00');
  });

  it('личный график перекрывает отдельский', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'dep-schedule', { startTime: '09:00' });
    seedSchedule(firestore, 'personal', {
      departmentId: null,
      userId: 'mop-1',
      startTime: '11:00',
    });

    // Личный график заводится именно затем, чтобы перекрыть общий.
    const schedule = await resolve(firestore);

    expect(schedule?.startTime).toBe('11:00');
  });

  it('без отдела и без личного графика ничего не находит', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'dep-schedule');

    await expect(resolve(firestore, null)).resolves.toBeNull();
  });
});

describe('срок действия графика', () => {
  it('ещё не вступивший в силу не применяется', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'future', {
      effectiveFrom: Timestamp.fromDate(new Date('2026-12-01T00:00:00Z')),
    });

    await expect(resolve(firestore)).resolves.toBeNull();
  });

  it('истёкший не применяется', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'expired', {
      effectiveTo: Timestamp.fromDate(new Date('2026-06-30T00:00:00Z')),
    });

    // Именно здесь две прежние копии расходились: правка табеля
    // продолжала применять график, который давно закончился.
    await expect(resolve(firestore)).resolves.toBeNull();
  });

  it('действующий с открытой датой окончания применяется', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'open', { effectiveTo: null });

    await expect(resolve(firestore)).resolves.not.toBeNull();
  });

  it('последний день действия ещё считается рабочим', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'ends-today', {
      effectiveTo: Timestamp.fromDate(new Date('2026-09-15T23:59:59Z')),
    });

    // Иначе в последний день графика сотрудник остался бы без него.
    await expect(resolve(firestore)).resolves.not.toBeNull();
  });

  it('истёкший личный график не перекрывает действующий отдельский', async () => {
    const firestore = new FakeFirestore();
    seedSchedule(firestore, 'dep-schedule', { startTime: '09:00' });
    seedSchedule(firestore, 'personal-expired', {
      departmentId: null,
      userId: 'mop-1',
      startTime: '11:00',
      effectiveTo: Timestamp.fromDate(new Date('2026-06-30T00:00:00Z')),
    });

    // Закончился личный график — сотрудник возвращается к общему,
    // а не остаётся вовсе без расписания.
    const schedule = await resolve(firestore);

    expect(schedule?.startTime).toBe('09:00');
  });
});
