import type { OnboardReport } from '../src/onboarding/onboard';
import { formatMessages, formatSummary } from '../src/onboarding/report';

const report: OnboardReport = {
  department: { id: 'dep-1', name: 'Кванта', created: true },
  office: 'office-1',
  head: 'Алимжан',
  rows: [
    { name: 'Алимжан', email: 'alimzhan@corpsol.kz', role: 'ROP', password: 'Corpsol101', status: 'created', links: [], problems: [] },
    { name: 'Диас', email: 'dias@corpsol.kz', role: 'MOP', password: 'Corpsol102', status: 'created', links: ['Kcell yarik'], problems: [] },
    { name: 'Нур', email: 'nur@corpsol.kz', role: 'MOP', password: null, status: 'existing', links: [], problems: ['Kcell saida уже привязан к другому сотруднику'] },
  ],
  sync: {
    kcell: { fetched: 900, imported: 850, withoutEmployee: 10, unmatched: [{ employeeKey: 'zafar', count: 40 }] },
    sipuni: { error: 'Sipuni не успел отдать выгрузку' },
  },
};

describe('отчёт о заведении', () => {
  it('итоги по людям, проблемы и добор звонков', () => {
    const text = formatSummary(report);

    expect(text).toContain('Отдел «Кванта» создан, руководитель — Алимжан');
    expect(text).toContain('заведён  Диас · dias@corpsol.kz · Kcell yarik');
    expect(text).toContain('уже был  Нур · nur@corpsol.kz · без номеров');
    expect(text).toContain('! Kcell saida уже привязан к другому сотруднику');
    expect(text).toContain('Добор kcell: получено 900, загружено 850, без сотрудника 10');
    expect(text).toContain('не привязаны: zafar=40');
    expect(text).toContain('Добор sipuni: не удался — Sipuni не успел отдать выгрузку');
  });

  it('сообщения с паролем — только заведённым сейчас, РОП — с отделом', () => {
    const text = formatMessages(report, '@CorpsolApp');

    expect(text).toContain('Алимжан, привет! Доступ в CorpSol (РОП отдела Кванта):');
    expect(text).toContain('Диас, привет! Доступ в CorpSol:\nЛогин: dias@corpsol.kz\nПароль: Corpsol102');
    expect(text).toContain('бота @CorpsolApp');
    expect(text).not.toContain('Нур');
  });
});
