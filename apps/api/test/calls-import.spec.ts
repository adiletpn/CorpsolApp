import { CallsImportService } from '../src/calls/calls-import.service';
import { COLLECTIONS } from '../src/firestore/collections';
import type { ImportedCall } from '../src/calls/types';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

function call(overrides: Partial<ImportedCall> = {}): ImportedCall {
  const startedAt = overrides.startedAt ?? new Date('2026-09-25T09:15:00Z');
  const employeePhone = overrides.employeeKey ?? '+77012345678';
  const clientPhone = overrides.clientPhone ?? '+77071112233';

  return {
    employeeKey: employeePhone,
    clientPhone,
    direction: 'OUTBOUND',
    startedAt,
    durationSeconds: 83,
    talkSeconds: 83,
    externalId: `${employeePhone}_${clientPhone}_${startedAt.getTime()}`,
    ...overrides,
  };
}

function setup(users: Array<{ id: string; phone?: string; departmentId?: string }>) {
  const firestore = new FakeFirestore();

  for (const user of users) {
    firestore.seed(COLLECTIONS.users, user.id, {
      organizationId: ORG,
      email: `${user.id}@corpsol.kz`,
      fullName: user.id,
      role: 'MOP',
      status: 'ACTIVE',
      phone: user.phone,
      departmentId: user.departmentId ?? null,
      officeId: null,
      baseSalaryMinor: 0,
      currency: 'KZT',
    });
  }

  return { firestore, service: new CallsImportService(fakeFirebase(firestore)) };
}

describe('сопоставление звонков с сотрудниками', () => {
  it('находит сотрудника по рабочему номеру', async () => {
    const { service } = setup([{ id: 'u1', phone: '+77012345678', departmentId: 'dep-1' }]);

    const result = await service.importCalls(ORG, [call()], 'KCELL');

    expect(result.imported).toBe(1);
    expect(result.unmatched).toHaveLength(0);
  });

  it('узнаёт номер, записанный в карточке в другом формате', async () => {
    // В карточке «8 701 234-56-78», в выгрузке «+77012345678».
    const { service } = setup([{ id: 'u1', phone: '8 701 234-56-78' }]);

    const result = await service.importCalls(ORG, [call()], 'KCELL');

    expect(result.imported).toBe(1);
  });

  it('копирует отдел в звонок — иначе план отдела не посчитается', async () => {
    const { firestore, service } = setup([
      { id: 'u1', phone: '+77012345678', departmentId: 'dep-1' },
    ]);

    await service.importCalls(ORG, [call()], 'KCELL');

    const stored = firestore.read(COLLECTIONS.calls, `KCELL_${call().externalId}`);
    expect(stored?.departmentId).toBe('dep-1');
    expect(stored?.userId).toBe('u1');
  });

  it('складывает несопоставленные по номерам и не теряет их молча', async () => {
    const { service } = setup([{ id: 'u1', phone: '+77012345678' }]);

    const result = await service.importCalls(
      ORG,
      [call(), call({ employeeKey: '+77079999999' }), call({ employeeKey: '+77079999999' })],
      'KCELL',
    );

    expect(result.imported).toBe(1);
    expect(result.unmatched).toEqual([{ employeeKey: '+77079999999', count: 2 }]);
  });
});

describe('защита от повторной загрузки', () => {
  it('не создаёт дубль при импорте того же файла второй раз', async () => {
    const { service } = setup([{ id: 'u1', phone: '+77012345678' }]);
    const calls = [call()];

    const first = await service.importCalls(ORG, calls, 'KCELL');
    const second = await service.importCalls(ORG, calls, 'KCELL');

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it('различает один и тот же звонок из разных источников', async () => {
    const { firestore, service } = setup([{ id: 'u1', phone: '+77012345678' }]);

    await service.importCalls(ORG, [call()], 'KCELL');
    await service.importCalls(ORG, [call()], 'BITRIX');

    // Ключ включает источник, поэтому записи не перетирают друг друга.
    expect(firestore.read(COLLECTIONS.calls, `KCELL_${call().externalId}`)).toBeDefined();
    expect(firestore.read(COLLECTIONS.calls, `BITRIX_${call().externalId}`)).toBeDefined();
  });
});

describe('статус звонка', () => {
  it('звонок без разговора считается неотвеченным', async () => {
    const { firestore, service } = setup([{ id: 'u1', phone: '+77012345678' }]);
    const missed = call({ durationSeconds: 0, talkSeconds: 0 });

    await service.importCalls(ORG, [missed], 'KCELL');

    const stored = firestore.read(COLLECTIONS.calls, `KCELL_${missed.externalId}`);
    // По таким звонкам план не закрывается — это набранный номер, не работа.
    expect(stored?.status).toBe('NO_ANSWER');
  });

  it('звонок с разговором считается состоявшимся', async () => {
    const { firestore, service } = setup([{ id: 'u1', phone: '+77012345678' }]);

    await service.importCalls(ORG, [call()], 'KCELL');

    const stored = firestore.read(COLLECTIONS.calls, `KCELL_${call().externalId}`);
    expect(stored?.status).toBe('ANSWERED');
    expect(stored?.talkSeconds).toBe(83);
  });
});

describe('дата звонка', () => {
  it('раскладывает звонок по календарной дате часового пояса офиса', async () => {
    const { firestore, service } = setup([{ id: 'u1', phone: '+77012345678' }]);
    // 20:30 UTC — это уже следующий день в Алматы.
    const lateCall = call({ startedAt: new Date('2026-09-25T20:30:00Z') });

    await service.importCalls(ORG, [lateCall], 'KCELL', 'phone', 'Asia/Almaty');

    const stored = firestore.read(COLLECTIONS.calls, `KCELL_${lateCall.externalId}`);
    expect(stored?.callDate).toBe('2026-09-26');
  });
});

describe('пустая выгрузка', () => {
  it('не делает лишней работы', async () => {
    const { service } = setup([{ id: 'u1', phone: '+77012345678' }]);

    const result = await service.importCalls(ORG, [], 'KCELL');

    expect(result).toEqual({ imported: 0, duplicates: 0, unmatched: [] });
  });
});
