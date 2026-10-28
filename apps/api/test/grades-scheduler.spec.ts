import { JobLockService } from '../src/common/jobs/job-lock.service';
import { COLLECTIONS } from '../src/firestore/collections';
import { GradesScheduler, previousMonth } from '../src/payroll/grades.scheduler';
import { GradesService } from '../src/payroll/grades.service';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

function setup() {
  const firestore = new FakeFirestore();
  const firebase = fakeFirebase(firestore);
  firestore.seed(COLLECTIONS.organizations, ORG, { name: 'CorpSol', timezone: 'Asia/Almaty' });

  const user = (id: string, gradeCode: string | null, status = 'ACTIVE') =>
    firestore.seed(COLLECTIONS.users, id, { organizationId: ORG, fullName: id, role: 'MOP', status, gradeCode });
  user('dina', 'A');
  user('mariya', 'C');
  user('luiza', 'B');
  user('new', null);

  let seq = 0;
  const offers = (userId: string, count: number, sentDate = '2026-10-15', status = 'ACCEPTED') => {
    for (let i = 0; i < count; i += 1) {
      firestore.seed(COLLECTIONS.offers, `o${(seq += 1)}`, { organizationId: ORG, userId, sentDate, status });
    }
  };

  const grades = new GradesService(firebase);
  const scheduler = new GradesScheduler(firebase, grades, new JobLockService(firebase));
  const gradeOf = (id: string) => firestore.read(COLLECTIONS.users, id)?.gradeCode;
  return { firestore, grades, scheduler, offers, gradeOf };
}

describe('пересмотр рангов по итогу месяца', () => {
  it('30 регистраций за октябрь — ранг Б, 40 — С, меньше 25 — А', async () => {
    const { grades, offers, gradeOf } = setup();
    offers('dina', 30);
    offers('mariya', 12);
    offers('luiza', 41);

    const changes = await grades.regradeForMonth(ORG, 2026, 10);

    expect(gradeOf('dina')).toBe('B');
    expect(gradeOf('mariya')).toBe('A');
    expect(gradeOf('luiza')).toBe('C');
    expect(changes).toContainEqual({ userId: 'mariya', from: 'C', to: 'A', monthCount: 12 });
  });

  it('считаются только принятые регистрации этого месяца', async () => {
    const { grades, offers, gradeOf } = setup();
    offers('dina', 20);
    offers('dina', 10, '2026-10-20', 'SENT');
    offers('dina', 10, '2026-09-30');
    offers('dina', 10, '2026-11-01');

    await grades.regradeForMonth(ORG, 2026, 10);

    expect(gradeOf('dina')).toBe('A');
  });

  it('сотрудник без ранга не переводится: он на старой схеме зарплаты', async () => {
    const { grades, offers, gradeOf } = setup();
    offers('new', 45);

    await grades.regradeForMonth(ORG, 2026, 10);

    expect(gradeOf('new')).toBeNull();
  });

  it('пересмотр пишется в журнал одной записью', async () => {
    const { firestore, grades, offers } = setup();
    offers('dina', 30);

    await grades.regradeForMonth(ORG, 2026, 10);

    const audit = firestore.all(COLLECTIONS.auditEvents).filter((event) => event.action === 'grades.monthly');
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ month: '2026-10' });
  });
});

describe('ночной прогон рангов', () => {
  it('1 ноября по Алматы пересматривает октябрь', async () => {
    const { scheduler, offers, gradeOf } = setup();
    offers('dina', 30);

    // 31 октября 20:00 UTC — это уже 1 ноября в Алматы.
    const results = await scheduler.regradeEverywhere(new Date('2026-10-31T20:00:00Z'));

    // Дина поднялась до Б, Мария и Луиза без регистраций опустились до А.
    expect(results).toEqual([{ organizationId: ORG, month: '2026-10', changed: 3 }]);
    expect(gradeOf('dina')).toBe('B');
    expect(gradeOf('luiza')).toBe('A');
  });

  it('второй прогон в том же месяце не трогает ранг, выставленный руками', async () => {
    const { scheduler, firestore, offers, gradeOf } = setup();
    offers('dina', 30);
    await scheduler.regradeEverywhere(new Date('2026-11-01T00:00:00Z'));

    firestore.seed(COLLECTIONS.users, 'dina', {
      ...firestore.read(COLLECTIONS.users, 'dina'),
      gradeCode: 'C',
    });
    const again = await scheduler.regradeEverywhere(new Date('2026-11-02T00:00:00Z'));

    expect(again).toEqual([]);
    expect(gradeOf('dina')).toBe('C');
  });

  it('январь пересматривает декабрь прошлого года', () => {
    expect(previousMonth('2027-01-01')).toEqual({ year: 2026, month: 12 });
    expect(previousMonth('2026-11-01')).toEqual({ year: 2026, month: 10 });
  });
});
