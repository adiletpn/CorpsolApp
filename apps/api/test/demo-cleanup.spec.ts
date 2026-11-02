import { cleanupDemo } from '../src/demo/demo-cleanup';
import { COLLECTIONS } from '../src/firestore/collections';
import { FakeFirestore, fakeFirebase } from './fake-firestore';

const ORG = 'org-1';

function setup() {
  const firestore = new FakeFirestore();
  const db = fakeFirebase(firestore).firestore as never;

  // Витрина — настоящая учётка, временно в демо-отделе.
  firestore.seed(COLLECTIONS.users, 'showcase', { organizationId: ORG, fullName: 'Демо Менеджер', departmentId: 'demo-department', demoDepartment: true });
  firestore.seed(COLLECTIONS.users, 'demo-colleague-1', { organizationId: ORG, fullName: 'Айгерим', demo: true });
  firestore.seed(COLLECTIONS.users, 'dina', { organizationId: ORG, fullName: 'Дина', departmentId: 'kz' });
  firestore.seed(COLLECTIONS.departments, 'demo-department', { organizationId: ORG, name: 'Отдел продаж', demo: true });
  firestore.seed(COLLECTIONS.departments, 'kz', { organizationId: ORG, name: 'КЗ' });

  firestore.seed(COLLECTIONS.attendance, 'showcase_2026-10-05', { organizationId: ORG, userId: 'showcase', demo: true });
  firestore.seed(COLLECTIONS.attendance, 'dina_2026-10-05', { organizationId: ORG, userId: 'dina' });
  firestore.seed(COLLECTIONS.calls, 'c-demo', { organizationId: ORG, userId: 'demo-colleague-1', demo: true });
  firestore.seed(COLLECTIONS.calls, 'c-real', { organizationId: ORG, userId: 'dina' });

  // Накопилось после заполнения: без пометки demo.
  firestore.seed(COLLECTIONS.fenceAttempts, 'f1', { organizationId: ORG, userId: 'showcase', workDate: '2026-10-28' });
  firestore.seed(COLLECTIONS.fenceAttempts, 'f2', { organizationId: ORG, userId: 'dina', workDate: '2026-10-28' });
  firestore.seed(COLLECTIONS.notifications, 'n1', { organizationId: ORG, userId: 'demo-colleague-1' });
  firestore.seed(COLLECTIONS.notifications, 'n2', { organizationId: ORG, userId: 'dina' });

  // Чужая организация с такой же пометкой — не наша.
  firestore.seed(COLLECTIONS.calls, 'c-alien', { organizationId: 'org-2', demo: true });

  return { firestore, db };
}

const ids = (firestore: FakeFirestore, collection: string) =>
  firestore
    .all(collection)
    .map((doc) => (doc.userId ?? doc.name ?? doc.fullName) as string)
    .sort();

describe('уборка демо-витрины', () => {
  it('без подтверждения только считает и ничего не удаляет', async () => {
    const { firestore, db } = setup();

    const report = await cleanupDemo(db, ORG);

    expect(report.applied).toBe(false);
    expect(report.marked[COLLECTIONS.attendance]).toBe(1);
    expect(report.marked[COLLECTIONS.calls]).toBe(1);
    expect(report.owned).toEqual({ [COLLECTIONS.notifications]: 1, [COLLECTIONS.fenceAttempts]: 1 });
    expect(report.movedBack).toBe(1);
    expect(firestore.all(COLLECTIONS.calls)).toHaveLength(3);
  });

  it('с подтверждением убирает демо и не задевает настоящее', async () => {
    const { firestore, db } = setup();

    await cleanupDemo(db, ORG, true);

    expect(ids(firestore, COLLECTIONS.attendance)).toEqual(['dina']);
    expect(firestore.all(COLLECTIONS.calls).map((doc) => doc.userId ?? doc.organizationId).sort()).toEqual(['dina', 'org-2']);
    expect(ids(firestore, COLLECTIONS.fenceAttempts)).toEqual(['dina']);
    expect(ids(firestore, COLLECTIONS.notifications)).toEqual(['dina']);
    expect(ids(firestore, COLLECTIONS.departments)).toEqual(['КЗ']);
  });

  it('вымышленные коллеги удаляются, витрина остаётся и выходит из демо-отдела', async () => {
    const { firestore, db } = setup();

    await cleanupDemo(db, ORG, true);

    expect(firestore.read(COLLECTIONS.users, 'demo-colleague-1')).toBeUndefined();
    expect(firestore.read(COLLECTIONS.users, 'showcase')).toMatchObject({ departmentId: null });
    expect(firestore.read(COLLECTIONS.users, 'dina')).toMatchObject({ departmentId: 'kz' });
  });
});
