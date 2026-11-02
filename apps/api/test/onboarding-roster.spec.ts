import { RosterError, parseRoster } from '../src/onboarding/roster';

const problems = (input: unknown): string[] => {
  try {
    parseRoster(input);
    return [];
  } catch (cause) {
    return (cause as RosterError).problems;
  }
};

describe('список отдела', () => {
  it('разбирает отдел, руководителя и рабочие номера', () => {
    const roster = parseRoster({
      department: ' Кванта ',
      resyncSince: '2026-10-01',
      employees: [
        { name: 'Алимжан', role: 'rop', head: true },
        { name: 'Диас', kcell: 'Yarik' },
        { name: 'Адема', login: 'adema', sipuni: '911' },
      ],
    });

    expect(roster.department).toBe('Кванта');
    expect(roster.resyncSince).toBe('2026-10-01');
    expect(roster.employees).toEqual([
      { name: 'Алимжан', email: 'alimzhan@corpsol.kz', role: 'ROP', head: true, kcell: null, sipuni: null },
      { name: 'Диас', email: 'dias@corpsol.kz', role: 'MOP', head: false, kcell: 'yarik', sipuni: null },
      { name: 'Адема', email: 'adema@corpsol.kz', role: 'MOP', head: false, kcell: null, sipuni: '911' },
    ]);
  });

  it('все ошибки разом, а не по одной за запуск', () => {
    const found = problems({
      employees: [{ name: '' }, { name: 'Нур', role: 'BOSS' }, { name: 'Султан', sipuni: '23 4' }],
      resyncSince: '1 октября',
    });

    expect(found).toHaveLength(5);
    expect(found.join('\n')).toMatch(/отдел/);
    expect(found.join('\n')).toMatch(/дата вида/);
    expect(found.join('\n')).toMatch(/нет имени/);
    expect(found.join('\n')).toMatch(/роль «BOSS»/);
    expect(found.join('\n')).toMatch(/номер Sipuni «23 4»/);
  });

  it('один логин Kcell у двоих — ошибка, даже в разном регистре', () => {
    const found = problems({ department: 'КЗ', employees: [{ name: 'Диас', kcell: 'yarik' }, { name: 'Нур', kcell: 'YARIK' }] });

    expect(found).toEqual(['«kcell:yarik» указан и у Диас, и у Нур.']);
  });

  it('два человека с одинаковым логином входа — ошибка', () => {
    const found = problems({ department: 'УЗ', employees: [{ name: 'Адема' }, { name: 'Адема' }] });

    expect(found).toEqual(['«adema@corpsol.kz» указан и у Адема, и у Адема.']);
  });

  it('руководитель один и только РОП', () => {
    const found = problems({
      department: 'УЗ',
      employees: [
        { name: 'Еркебулан', role: 'ROP', head: true },
        { name: 'Эльза', head: true },
      ],
    });

    expect(found).toContain('Руководитель отдела должен быть один, а отмечены: Еркебулан, Эльза.');
    expect(found).toContain('Руководителем отдела отмечен не РОП.');
  });

  it('пустой или битый файл — понятная причина', () => {
    expect(problems(null)).toEqual(['Не указан отдел: "department".', 'Список "employees" пуст.']);
  });
});

describe('пример из документации', () => {
  it('проходит проверку — документация не разошлась с кодом', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const example = require('../../../docs/examples/roster.example.json');

    const roster = parseRoster(example);

    expect(roster.employees.find((person) => person.head)?.role).toBe('ROP');
    expect(roster.employees.map((person) => person.email)).toContain('daniyar.o@corpsol.kz');
  });
});
