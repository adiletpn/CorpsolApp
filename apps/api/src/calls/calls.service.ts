import { ForbiddenException, Injectable } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { CallDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface CallView {
  id: string;
  userId: string;
  direction: CallDoc['direction'];
  status: CallDoc['status'];
  clientPhone: string;
  callDate: string;
  startedAt: string;
  durationSeconds: number;
  talkSeconds: number;
  source: CallDoc['source'];
}

export interface CallsSummary {
  total: number;
  answered: number;
  talkMinutes: number;
}

@Injectable()
export class CallsService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Звонки с учётом области видимости роли.
   *
   * МОП по ТЗ видит только свои звонки, РОП — весь отдел,
   * директор и админ — всю компанию.
   */
  async list(
    actor: AuthenticatedUser,
    from?: string,
    to?: string,
    userId?: string,
  ): Promise<CallView[]> {
    let query = this.db
      .collection(COLLECTIONS.calls)
      .where('organizationId', '==', actor.organizationId);

    if (actor.role === 'MOP') {
      query = query.where('userId', '==', actor.id);
    } else if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      query = query.where('departmentId', '==', actor.departmentId);
      if (userId) query = query.where('userId', '==', userId);
    } else if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (from) query = query.where('callDate', '>=', from);
    if (to) query = query.where('callDate', '<=', to);

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.toView(doc.id, doc.data() as CallDoc))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Сводка за период — для личного экрана и дашбордов. */
  async summary(
    actor: AuthenticatedUser,
    from?: string,
    to?: string,
    userId?: string,
  ): Promise<CallsSummary> {
    const calls = await this.list(actor, from, to, userId);

    const answered = calls.filter((call) => call.status === 'ANSWERED');
    const talkSeconds = answered.reduce((total, call) => total + call.talkSeconds, 0);

    return {
      total: calls.length,
      answered: answered.length,
      // Минуты округляем вниз: показывать 5 минут при четырёх с половиной
      // значит завышать результат в отчётах.
      talkMinutes: Math.floor(talkSeconds / 60),
    };
  }

  private toView(id: string, doc: CallDoc): CallView {
    return {
      id,
      userId: doc.userId,
      direction: doc.direction,
      status: doc.status,
      clientPhone: doc.clientPhone,
      callDate: doc.callDate,
      startedAt: doc.startedAt.toDate().toISOString(),
      durationSeconds: doc.durationSeconds,
      talkSeconds: doc.talkSeconds,
      source: doc.source,
    };
  }
}
