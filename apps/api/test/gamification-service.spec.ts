import { Timestamp } from 'firebase-admin/firestore';

import { GamificationService } from '../src/gamification/gamification.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

const actor = (
  role: AuthenticatedUser['role'],
  id = 'mop-1',
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
  return { firestore, service: new GamificationService(fakeFirebase(firestore)) };
}

function seedMember(
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
    officeId: null,
    baseSalaryMinor: 0,
    ...fields,
  });
}

function seedPoints(
  firestore: FakeFirestore,
  id: string,
  userId: string,
  points: number,
  fields: Record<string, unknown> = {},
) {
  firestore.seed(COLLECTIONS.points, id, {
    userId,
    reason: 'CALL_VOLUME',
    points,
    refType: null,
    refId: null,
    comment: null,
    createdAt: Timestamp.fromDate(new Date('2026-09-15T10:00:00Z')),
    ...fields,
  });
}

describe('кто попадает в рейтинг', () => {
  it('менеджеры и руководители соревнуются вместе', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'rop-1', { role: 'ROP' });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries).toHaveLength(2);
  });

  it('директор и кадровик в рейтинге не участвуют', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'director-1', { role: 'DIRECTOR' });
    seedMember(firestore, 'hr-1', { role: 'HR' });

    // Им не за что начислять очки — нулями они бы только засоряли таблицу.
    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries.map((item) => item.userId)).toEqual(['mop-1']);
  });

  it('уволенные выпадают из рейтинга', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'mop-fired', { status: 'TERMINATED' });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries).toHaveLength(1);
  });

  it('сотрудники чужой организации не видны', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'alien', { organizationId: 'other-org' });

    const result = await service.leaderboard(
      actor('DIRECTOR', 'dir', { departmentId: null }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(result.entries).toHaveLength(1);
  });
});

describe('область рейтинга по ролям', () => {
  const twoDepartments = () => {
    const context = setup();
    seedMember(context.firestore, 'mop-1', { departmentId: 'dep-1' });
    seedMember(context.firestore, 'mop-2', { departmentId: 'dep-2' });
    return context;
  };

  it('менеджер видит рейтинг своего отдела', async () => {
    const { service } = twoDepartments();

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    // Соревноваться с соседним отделом бессмысленно: условия разные.
    expect(result.departmentId).toBe('dep-1');
    expect(result.entries.map((item) => item.userId)).toEqual(['mop-1']);
  });

  it('запрос чужого отдела подменяется своим, а не отклоняется', async () => {
    const { service } = twoDepartments();

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end, 'dep-2');

    // Рейтинг — не то место, где уместна ошибка доступа.
    expect(result.departmentId).toBe('dep-1');
  });

  it('директор по умолчанию видит компанию целиком', async () => {
    const { service } = twoDepartments();

    const result = await service.leaderboard(
      actor('DIRECTOR', 'dir', { departmentId: null }),
      PERIOD.start,
      PERIOD.end,
    );

    expect(result.departmentId).toBeNull();
    expect(result.entries).toHaveLength(2);
  });

  it('директор может сузить рейтинг до отдела', async () => {
    const { service } = twoDepartments();

    const result = await service.leaderboard(
      actor('DIRECTOR', 'dir', { departmentId: null }),
      PERIOD.start,
      PERIOD.end,
      'dep-2',
    );

    expect(result.entries.map((item) => item.userId)).toEqual(['mop-2']);
  });

  it('менеджер без отдела получает отказ', async () => {
    const { service } = twoDepartments();

    await expect(
      service.leaderboard(actor('MOP', 'mop-1', { departmentId: null }), PERIOD.start, PERIOD.end),
    ).rejects.toThrow(/не привязан к отделу/);
  });
});

describe('очки внутри периода', () => {
  it('начисления вне периода не считаются', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p-before', 'mop-1', 50, {
      createdAt: Timestamp.fromDate(new Date('2026-08-31T23:00:00Z')),
    });
    seedPoints(firestore, 'p-inside', 'mop-1', 10);
    seedPoints(firestore, 'p-after', 'mop-1', 70, {
      createdAt: Timestamp.fromDate(new Date('2026-10-01T01:00:00Z')),
    });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    // Иначе прошлый месяц навсегда держал бы лидера на первом месте.
    expect(result.entries[0].points).toBe(10);
  });

  it('границы периода включаются', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p-first', 'mop-1', 3, {
      createdAt: Timestamp.fromDate(new Date('2026-09-01T00:00:00Z')),
    });
    seedPoints(firestore, 'p-last', 'mop-1', 4, {
      createdAt: Timestamp.fromDate(new Date('2026-09-30T23:59:59Z')),
    });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(result.entries[0].points).toBe(7);
  });

  it('сотрудник без начислений остаётся в таблице с нулём', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'mop-2');
    seedPoints(firestore, 'p1', 'mop-1', 20);

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    // Выпасть из таблицы — значит не узнать, что отстаёшь.
    const zero = result.entries.find((item) => item.userId === 'mop-2');
    expect(zero?.points).toBe(0);
  });

  it('чужие начисления не попадают в свой счёт', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedMember(firestore, 'mop-2');
    seedPoints(firestore, 'p1', 'mop-1', 20);
    seedPoints(firestore, 'p2', 'mop-2', 500);

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    const mine = result.entries.find((item) => item.userId === 'mop-1');
    expect(mine?.points).toBe(20);
  });
});

describe('своё место в рейтинге', () => {
  const crowd = () => {
    const context = setup();
    for (let index = 1; index <= 14; index += 1) {
      const id = `mop-${index}`;
      seedMember(context.firestore, id);
      seedPoints(context.firestore, `p-${index}`, id, 100 - index);
    }
    return context;
  };

  it('показывает верхушку из десяти', async () => {
    const { service } = crowd();

    const result = await service.leaderboard(actor('MOP', 'mop-14'), PERIOD.start, PERIOD.end);

    // Десять строк плюс сам сотрудник, не попавший в них.
    expect(result.entries).toHaveLength(11);
  });

  it('добавляет сотрудника, не попавшего в верхушку', async () => {
    const { service } = crowd();

    const result = await service.leaderboard(actor('MOP', 'mop-14'), PERIOD.start, PERIOD.end);

    // Рейтинг без своего места перечисляет чужие успехи, а не мотивирует.
    expect(result.entries.some((item) => item.userId === 'mop-14')).toBe(true);
  });

  it('отдаёт своё место отдельным полем', async () => {
    const { service } = crowd();

    const result = await service.leaderboard(actor('MOP', 'mop-14'), PERIOD.start, PERIOD.end);

    expect(result.self?.userId).toBe('mop-14');
    expect(result.self?.rank).toBe(14);
  });

  it('не дублирует лидера в его же верхушке', async () => {
    const { service } = crowd();

    const result = await service.leaderboard(actor('MOP', 'mop-1'), PERIOD.start, PERIOD.end);

    expect(result.entries).toHaveLength(10);
    expect(result.self?.rank).toBe(1);
  });

  it('руководитель видит и своё место среди подчинённых', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'rop-1', { role: 'ROP' });
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p1', 'rop-1', 5);
    seedPoints(firestore, 'p2', 'mop-1', 9);

    const result = await service.leaderboard(actor('ROP', 'rop-1'), PERIOD.start, PERIOD.end);

    expect(result.self?.rank).toBe(2);
  });
});

describe('расшифровка очков', () => {
  it('группирует начисления по причине', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p1', 'mop-1', 10, { reason: 'CALL_VOLUME' });
    seedPoints(firestore, 'p2', 'mop-1', 5, { reason: 'CALL_VOLUME' });
    seedPoints(firestore, 'p3', 'mop-1', 30, { reason: 'OFFER_ACCEPTED' });

    const result = await service.leaderboard(actor('MOP'), PERIOD.start, PERIOD.end);

    // Без расшифровки сотрудник не поймёт, чем поднимать свой счёт.
    expect(result.entries[0].breakdown).toEqual({ CALL_VOLUME: 15, OFFER_ACCEPTED: 30 });
  });

  it('личная сводка повторяет расчёт рейтинга', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p1', 'mop-1', 10, { reason: 'CALL_VOLUME' });
    seedPoints(firestore, 'p2', 'mop-1', 30, { reason: 'OFFER_ACCEPTED' });

    const summary = await service.myPoints(actor('MOP'), PERIOD.start, PERIOD.end);

    // Расхождение экрана сотрудника с рейтингом выглядело бы как обман.
    expect(summary).toEqual({
      total: 40,
      byReason: { CALL_VOLUME: 10, OFFER_ACCEPTED: 30 },
    });
  });

  it('личная сводка отсекает чужой период', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p-old', 'mop-1', 99, {
      createdAt: Timestamp.fromDate(new Date('2026-08-10T10:00:00Z')),
    });

    const summary = await service.myPoints(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(summary.total).toBe(0);
  });

  it('штрафные начисления уменьшают счёт', async () => {
    const { firestore, service } = setup();
    seedMember(firestore, 'mop-1');
    seedPoints(firestore, 'p1', 'mop-1', 50, { reason: 'OFFER_ACCEPTED' });
    seedPoints(firestore, 'p2', 'mop-1', -20, { reason: 'LATE' });

    const summary = await service.myPoints(actor('MOP'), PERIOD.start, PERIOD.end);

    expect(summary.total).toBe(30);
    expect(summary.byReason.LATE).toBe(-20);
  });
});
