import { ReportsService } from '../src/reports/reports.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

const actor = () =>
  ({
    id: 'dir-1',
    organizationId: ORG,
    role: 'DIRECTOR',
    departmentId: null,
  }) as never;

/** Записи табеля и расчёты подставляются: их сервисы проверены отдельно. */
function setup(records: unknown[] = [], payrolls: unknown[] = [], timezone = 'Asia/Almaty') {
  const firestore = new FakeFirestore();

  firestore.seed(COLLECTIONS.organizations, ORG, { name: 'CorpSol', timezone });
  firestore.seed(COLLECTIONS.users, 'uid-1', {
    organizationId: ORG,
    fullName: 'Асель Ким',
  });
  firestore.seed(COLLECTIONS.departments, 'dep-1', {
    organizationId: ORG,
    name: 'Продажи',
  });

  const service = new ReportsService(
    fakeFirebase(firestore),
    { listScoped: async () => records } as never,
    { list: async () => payrolls } as never,
  );

  return { firestore, service };
}

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  userId: 'uid-1',
  departmentId: 'dep-1',
  officeId: 'office-1',
  workDate: '2026-10-05',
  checkInAt: '2026-10-05T04:03:00.000Z',
  checkOutAt: '2026-10-05T13:10:00.000Z',
  status: 'LATE',
  lateMinutes: 3,
  method: 'QR',
  distanceMeters: 12,
  isMocked: false,
  ...overrides,
});

const payroll = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  userId: 'uid-1',
  departmentId: 'dep-1',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  baseSalaryMinor: 250_000_00,
  bonusMinor: 30_000_00,
  penaltyMinor: 5_000_00,
  totalMinor: 275_000_00,
  status: 'CALCULATED',
  ...overrides,
});

/** Строки файла без метки кодировки. */
const lines = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n');

describe('выгрузка табеля', () => {
  it('время прихода местное, а не UTC', async () => {
    const { service } = setup([record()]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    // 04:03 UTC в Алматы — это 09:03. Бухгалтер сверяет с графиком,
    // где стоит 09:00, и увидел бы расхождение в пять часов.
    expect(lines(csv)[1]).toContain('09:03');
  });

  it('пояс берётся у организации, а не у сервера', async () => {
    const { service } = setup([record()], [], 'Europe/Lisbon');

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    expect(lines(csv)[1]).toContain('05:03');
  });

  it('статус и способ отметки названы по-русски', async () => {
    const { service } = setup([record({ method: 'MANUAL_ADJUSTMENT' })]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    // По способу отметки видно, какие дни проставлены руками.
    expect(lines(csv)[1]).toContain('Опоздание');
    expect(lines(csv)[1]).toContain('Правка руководителя');
  });

  it('день без ухода не выдумывает время', async () => {
    const { service } = setup([record({ checkOutAt: null })]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    expect(lines(csv)[1]).not.toContain('00:00');
  });

  it('уволенный сотрудник не теряет строку', async () => {
    const { service } = setup([record({ userId: 'uid-404' })]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    expect(lines(csv)[1]).toContain('Сотрудник удалён');
  });

  it('период идёт сверху вниз от начала', async () => {
    const { service } = setup([
      record({ id: 'a', workDate: '2026-10-07' }),
      record({ id: 'b', workDate: '2026-10-05' }),
    ]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    // В экране удобнее свежее сверху, в документе — наоборот.
    expect(lines(csv)[1]).toContain('2026-10-05');
  });

  it('пустой период отдаёт заголовки, а не пустой файл', async () => {
    const { service } = setup([]);

    const csv = await service.attendanceCsv(actor(), '2026-10-01', '2026-10-31');

    expect(lines(csv)).toHaveLength(1);
    expect(lines(csv)[0]).toContain('Сотрудник');
  });
});

describe('выгрузка расчётных листов', () => {
  it('суммы переведены из тиын в тенге', async () => {
    const { service } = setup([], [payroll()]);

    const csv = await service.payrollCsv(actor(), '2026-10-01');

    expect(lines(csv)[1]).toContain('250000,00');
  });

  it('удержание уходит со знаком минус', async () => {
    const { service } = setup([], [payroll({ penaltyMinor: 5_000_00 })]);

    const csv = await service.payrollCsv(actor(), '2026-10-01');

    // В ведомости удержание вычитается, и колонка должна
    // складываться сама, без правки знаков руками.
    expect(lines(csv)[1]).toContain('-5000,00');
  });

  it('отдел подставляется по имени', async () => {
    const { service } = setup([], [payroll()]);

    const csv = await service.payrollCsv(actor(), '2026-10-01');

    expect(lines(csv)[1]).toContain('Продажи');
  });

  it('формула в имени сотрудника обезврежена', async () => {
    const { firestore, service } = setup([], [payroll()]);
    firestore.seed(COLLECTIONS.users, 'uid-1', {
      organizationId: ORG,
      fullName: '=HYPERLINK("http://зло")',
    });

    const csv = await service.payrollCsv(actor(), '2026-10-01');

    // Файл открывают в Excel у бухгалтера — формула выполнилась бы там.
    expect(csv).toContain("'=HYPERLINK");
  });
});
