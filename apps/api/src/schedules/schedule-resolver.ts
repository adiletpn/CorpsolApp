import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import { COLLECTIONS } from '../firestore/collections';
import type { WorkScheduleDoc } from '../firestore/types';

/**
 * Поиск графика, действующего на заданный момент.
 *
 * Личный график имеет приоритет над отдельским: он заводится именно затем,
 * чтобы перекрыть общий.
 *
 * Жил двумя копиями — в отметке прихода и в ручной правке табеля, — и копии
 * успели разойтись: одна проверяла срок действия графика, другая нет,
 * из-за чего истёкший график продолжал применяться при правке.
 */
export async function findActiveSchedule(
  db: Firestore,
  userId: string,
  departmentId: string | null,
  at: Date,
): Promise<WorkScheduleDoc | null> {
  const moment = Timestamp.fromDate(at);

  const isActive = (doc: WorkScheduleDoc): boolean =>
    doc.effectiveTo === null || doc.effectiveTo.toDate() >= at;

  const personal = await db
    .collection(COLLECTIONS.workSchedules)
    .where('userId', '==', userId)
    .where('effectiveFrom', '<=', moment)
    .orderBy('effectiveFrom', 'desc')
    .limit(1)
    .get();

  if (!personal.empty) {
    const doc = personal.docs[0].data() as WorkScheduleDoc;
    if (isActive(doc)) return doc;
  }

  if (!departmentId) return null;

  const departmental = await db
    .collection(COLLECTIONS.workSchedules)
    .where('departmentId', '==', departmentId)
    .where('effectiveFrom', '<=', moment)
    .orderBy('effectiveFrom', 'desc')
    .limit(1)
    .get();

  if (departmental.empty) return null;

  const doc = departmental.docs[0].data() as WorkScheduleDoc;
  return isActive(doc) ? doc : null;
}
