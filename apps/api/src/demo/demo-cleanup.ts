import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { COLLECTIONS } from '../firestore/collections';

/** Коллекции, куда демо-витрина пишет записи с пометкой demo: true. */
export const DEMO_MARKED_COLLECTIONS = [
  COLLECTIONS.attendance,
  COLLECTIONS.points,
  COLLECTIONS.offers,
  COLLECTIONS.calls,
  COLLECTIONS.payrolls,
  COLLECTIONS.userAchievements,
  COLLECTIONS.plans,
  COLLECTIONS.users,
  COLLECTIONS.departments,
] as const;

/**
 * Что копится у демо-людей уже после заполнения и пометки demo не несёт:
 * уведомления, попытки отметки вне офиса. Без уборки они остались бы
 * висеть на удалённых карточках.
 */
export const DEMO_OWNED_COLLECTIONS = [COLLECTIONS.notifications, COLLECTIONS.fenceAttempts] as const;

export interface DemoCleanupReport {
  /** Сколько записей с пометкой demo в каждой коллекции. */
  marked: Record<string, number>;
  /** Сколько записей демо-людей без пометки. */
  owned: Record<string, number>;
  /** Сколько настоящих сотрудников вернётся из демо-отдела. */
  movedBack: number;
  applied: boolean;
}

type Doc = { ref: { delete(): Promise<unknown>; update(data: Record<string, unknown>): Promise<unknown> }; data(): Record<string, unknown> };

const inOrganization = (data: Record<string, unknown>, organizationId: string) =>
  data.organizationId === undefined || data.organizationId === organizationId;

/**
 * Уборка демо-витрины. Без apply только считает — так перед удалением
 * в боевой базе видно, что именно уйдёт. Настоящие записи не трогаются:
 * удаляется лишь помеченное demo и принадлежащее демо-людям.
 */
export async function cleanupDemo(db: Firestore, organizationId: string, apply = false): Promise<DemoCleanupReport> {
  const report: DemoCleanupReport = { marked: {}, owned: {}, movedBack: 0, applied: apply };
  const remove: Doc[] = [];

  // Демо-люди — вымышленные коллеги и сама витрина: её карточка настоящая,
  // но всё, что у неё накопилось, — показ, а не работа.
  const users = await db.collection(COLLECTIONS.users).where('organizationId', '==', organizationId).get();
  const demoUsers = new Set(
    users.docs.filter((doc) => doc.data().demo === true || doc.data().demoDepartment === true).map((doc) => doc.id),
  );

  for (const name of DEMO_MARKED_COLLECTIONS) {
    const snapshot = await db.collection(name).where('demo', '==', true).get();
    const docs = snapshot.docs.filter((doc) => inOrganization(doc.data(), organizationId)) as unknown as Doc[];
    report.marked[name] = docs.length;
    remove.push(...docs);
  }

  for (const name of DEMO_OWNED_COLLECTIONS) {
    const docs: Doc[] = [];
    for (const userId of demoUsers) {
      const snapshot = await db.collection(name).where('userId', '==', userId).get();
      docs.push(...(snapshot.docs.filter((doc) => inOrganization(doc.data(), organizationId)) as unknown as Doc[]));
    }
    report.owned[name] = docs.length;
    remove.push(...docs);
  }

  const moved = users.docs.filter((doc) => doc.data().demoDepartment === true) as unknown as Doc[];
  report.movedBack = moved.length;

  if (apply) {
    for (const doc of remove) await doc.ref.delete();
    for (const doc of moved) await doc.ref.update({ departmentId: null, demoDepartment: FieldValue.delete() });
  }

  return report;
}
