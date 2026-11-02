import { almatyMidnight, onboard } from '../src/onboarding/onboard';
import { parseRoster } from '../src/onboarding/roster';

/** Подставной сервер панели: хранит отделы, сотрудников и привязки в памяти. */
function fakeServer(seed: { offices?: Array<{ id: string; name: string }> } = {}) {
  const state = {
    departments: [] as Array<{ id: string; name: string; head: { id: string; fullName: string } | null }>,
    employees: [] as Array<{ id: string; email: string; fullName: string; role: string; departmentId: string | null; officeId: string | null }>,
    links: [] as Array<{ userId: string; provider: string; workNumber: string }>,
    syncs: [] as Array<{ pbx: string; since: Date }>,
    offices: seed.offices ?? [{ id: 'office-1', name: 'Офис Тараз' }],
    failEmail: null as string | null,
  };
  let seq = 0;
  const client = {
    departments: async () => state.departments,
    createDepartment: async (name: string) => {
      const department = { id: `dep-${(seq += 1)}`, name, head: null };
      state.departments.push(department);
      return department;
    },
    setDepartmentHead: async (id: string, headId: string) => {
      const department = state.departments.find((item) => item.id === id)!;
      department.head = { id: headId, fullName: state.employees.find((e) => e.id === headId)!.fullName };
      return department;
    },
    offices: async () => state.offices,
    employees: async () => state.employees,
    createEmployee: async (body: { email: string; fullName: string; role: string; departmentId: string; officeId: string | null }) => {
      if (body.email === state.failEmail) throw new Error('POST /employees: Такой email уже зарегистрирован');
      const employee = { id: `u-${(seq += 1)}`, ...body };
      state.employees.push(employee);
      return { ...employee, temporaryPassword: `Corpsol${100 + seq}` };
    },
    workNumbers: async () => state.links,
    linkWorkNumber: async (userId: string, workNumber: string, provider: string) => {
      const link = { userId, workNumber, provider };
      state.links.push(link);
      return link;
    },
    sync: async (pbx: string, since: Date) => {
      state.syncs.push({ pbx, since });
      return { fetched: 10, imported: 8, withoutEmployee: 2, unmatched: [] };
    },
  };
  return { state, client: client as never };
}

const KVANTA = parseRoster({
  department: 'Кванта',
  resyncSince: '2026-10-01',
  employees: [
    { name: 'Алимжан', role: 'ROP', head: true },
    { name: 'Диас', kcell: 'yarik' },
    { name: 'Нур', kcell: 'saida' },
    { name: 'Султан', kcell: 'danna', sipuni: '234' },
  ],
});

describe('заведение отдела по списку', () => {
  it('отдел, сотрудники в офисе, привязки, руководитель и добор звонков', async () => {
    const { state, client } = fakeServer();

    const report = await onboard(KVANTA, client);

    expect(report.department).toMatchObject({ name: 'Кванта', created: true });
    expect(report.office).toBe('office-1');
    expect(report.rows.map((row) => [row.name, row.status, row.links])).toEqual([
      ['Алимжан', 'created', []],
      ['Диас', 'created', ['Kcell yarik']],
      ['Нур', 'created', ['Kcell saida']],
      ['Султан', 'created', ['Kcell danna', 'Sipuni 234']],
    ]);
    expect(report.rows.every((row) => row.password?.startsWith('Corpsol'))).toBe(true);
    expect(state.employees.every((employee) => employee.officeId === 'office-1' && employee.departmentId === report.department.id)).toBe(true);
    expect(report.head).toBe('Алимжан');
    expect(state.departments[0].head?.fullName).toBe('Алимжан');
    expect(state.syncs.map((item) => item.pbx)).toEqual(['kcell', 'sipuni']);
    expect(state.syncs[0].since.toISOString()).toBe('2026-09-30T19:00:00.000Z');
  });

  it('повторный запуск ничего не задваивает и паролей заново не выдаёт', async () => {
    const { state, client } = fakeServer();
    await onboard(KVANTA, client);

    const again = await onboard(KVANTA, client);

    expect(again.department.created).toBe(false);
    expect(again.rows.every((row) => row.status === 'existing' && row.password === null)).toBe(true);
    expect(state.employees).toHaveLength(4);
    expect(state.links).toHaveLength(4);
    expect(state.departments).toHaveLength(1);
  });

  it('отдел находится по имени без учёта регистра и пробелов', async () => {
    const { state, client } = fakeServer();
    state.departments.push({ id: 'dep-old', name: ' кванта', head: null });

    const report = await onboard(KVANTA, client);

    expect(report.department).toEqual({ id: 'dep-old', name: ' кванта', created: false });
  });

  it('номер, привязанный к другому, не перехватывается', async () => {
    const { state, client } = fakeServer();
    state.links.push({ userId: 'someone', provider: 'KCELL_USER', workNumber: 'yarik' });

    const report = await onboard(KVANTA, client);

    const dias = report.rows.find((row) => row.name === 'Диас')!;
    expect(dias.links).toEqual([]);
    expect(dias.problems).toEqual(['Kcell yarik уже привязан к другому сотруднику']);
    expect(state.links.filter((link) => link.workNumber === 'yarik')).toHaveLength(1);
  });

  it('отказ по одному человеку не останавливает остальных', async () => {
    const { state, client } = fakeServer();
    state.failEmail = 'nur@corpsol.kz';

    const report = await onboard(KVANTA, client);

    expect(report.rows.find((row) => row.name === 'Нур')).toMatchObject({
      status: 'failed',
      problems: ['POST /employees: Такой email уже зарегистрирован'],
    });
    expect(report.rows.filter((row) => row.status === 'created')).toHaveLength(3);
  });

  it('уже заведённый в другом отделе — не переносится, а отмечается', async () => {
    const { state, client } = fakeServer();
    state.employees.push({ id: 'u-old', email: 'dias@corpsol.kz', fullName: 'Диас', role: 'MOP', departmentId: 'dep-kz', officeId: null });

    const report = await onboard(KVANTA, client);

    expect(report.rows.find((row) => row.name === 'Диас')!.problems).toEqual([
      'уже заведён в другом отделе — не переносил, проверьте в панели',
    ]);
    expect(state.employees.find((employee) => employee.id === 'u-old')!.departmentId).toBe('dep-kz');
  });

  it('офисов несколько и не указан — остановка до любых изменений', async () => {
    const { state, client } = fakeServer({ offices: [{ id: 'o1', name: 'Тараз' }, { id: 'o2', name: 'Алматы' }] });

    await expect(onboard(KVANTA, client)).rejects.toThrow('Офисов несколько — укажите "officeId": Тараз (o1), Алматы (o2).');
    expect(state.employees).toHaveLength(0);
    expect(state.departments).toHaveLength(0);
  });

  it('без даты передобора звонки не трогаются', async () => {
    const { state, client } = fakeServer();

    await onboard({ ...KVANTA, resyncSince: null }, client);

    expect(state.syncs).toEqual([]);
  });

  it('полночь по Алматы — это 19:00 UTC накануне', () => {
    expect(almatyMidnight('2026-11-01').toISOString()).toBe('2026-10-31T19:00:00.000Z');
  });
});
