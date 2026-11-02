import { Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, offerDocId } from '../firestore/collections';
import type { OfferDoc, UserDoc } from '../firestore/types';
import type { MappedDeal } from './bitrix-deals';

export interface DealsImportSummary {
  /** Новых сделок. */
  created: number;
  /** Уже известных, у которых что-то поменялось: стадия, сумма, ответственный. */
  updated: number;
  /** Без изменений с прошлой выгрузки. */
  unchanged: number;
  /** Ответственный в портале не привязан к сотруднику. */
  unmatched: Array<{ employeeKey: string; count: number }>;
}

/** Поля, по которым видно, изменилась ли сделка. */
const TRACKED: Array<keyof OfferDoc> = ['userId', 'departmentId', 'clientName', 'amountMinor', 'status', 'sentDate'];

/**
 * Сделки CRM в офферы. CRM здесь — источник правды: сделка, ушедшая
 * в «успешные», становится принятой регистрацией без подтверждения
 * руководителя — подтверждение уже случилось в самой CRM.
 */
@Injectable()
export class DealsImportService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async importDeals(organizationId: string, deals: MappedDeal[]): Promise<DealsImportSummary> {
    const summary: DealsImportSummary = { created: 0, updated: 0, unchanged: 0, unmatched: [] };
    const index = await this.employeesByPortalUser(organizationId);
    const unmatched = new Map<string, number>();

    for (const deal of deals) {
      const employee = index.get(deal.employeeKey);
      if (!employee) {
        unmatched.set(deal.employeeKey, (unmatched.get(deal.employeeKey) ?? 0) + 1);
        continue;
      }

      const doc: OfferDoc = {
        userId: employee.userId,
        organizationId,
        departmentId: employee.departmentId,
        clientName: deal.clientName,
        clientPhone: null,
        amountMinor: deal.amountMinor,
        status: deal.status,
        sentAt: Timestamp.fromDate(deal.sentAt),
        sentDate: deal.sentDate,
        resolvedAt: deal.resolvedAt ? Timestamp.fromDate(deal.resolvedAt) : null,
        source: 'BITRIX',
        externalId: deal.externalId,
      };

      const ref = this.db.collection(COLLECTIONS.offers).doc(offerDocId('BITRIX', deal.externalId));
      const snapshot = await ref.get();
      const existing = snapshot.data() as OfferDoc | undefined;

      if (!snapshot.exists) summary.created += 1;
      else if (TRACKED.some((field) => existing?.[field] !== doc[field])) summary.updated += 1;
      else {
        summary.unchanged += 1;
        continue;
      }

      await ref.set(doc);
    }

    summary.unmatched = [...unmatched].map(([employeeKey, count]) => ({ employeeKey, count }));
    return summary;
  }

  /** Пользователь портала → сотрудник, по привязкам «Рабочих номеров». */
  private async employeesByPortalUser(
    organizationId: string,
  ): Promise<Map<string, { userId: string; departmentId: string | null }>> {
    const [users, identities] = await Promise.all([
      this.db.collection(COLLECTIONS.users).where('organizationId', '==', organizationId).where('status', '==', 'ACTIVE').get(),
      this.db.collection(COLLECTIONS.externalIdentities).where('provider', '==', 'BITRIX').get(),
    ]);

    const byId = new Map(users.docs.map((doc) => [doc.id, doc.data() as UserDoc]));
    const index = new Map<string, { userId: string; departmentId: string | null }>();
    for (const doc of identities.docs) {
      const identity = doc.data() as { userId: string; externalKey: string };
      const user = byId.get(identity.userId);
      if (user) index.set(identity.externalKey, { userId: identity.userId, departmentId: user.departmentId });
    }
    return index;
  }
}
