import { Injectable } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { AuditEventDoc, UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface AuditEventView {
  id: string;
  action: string;
  actor: { id: string; fullName: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Действия, которые обходят автоматический контроль и заслуживают внимания. */
const SENSITIVE_ACTIONS = new Set([
  'attendance.adjust',
  'device.unbind',
  'employee.terminate',
]);

/**
 * Журнал аудита.
 *
 * Смысл системы — автоматический контроль, но у неё есть ручные обходы:
 * правка табеля, открепление телефона, увольнение. Журнал показывает,
 * кто ими пользовался, иначе обход остаётся невидимым.
 */
@Injectable()
export class AuditService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async list(
    actor: AuthenticatedUser,
    options: { limit?: number; action?: string; sensitiveOnly?: boolean } = {},
  ): Promise<AuditEventView[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    let query = this.db
      .collection(COLLECTIONS.auditEvents)
      .where('organizationId', '==', actor.organizationId);

    if (options.action) query = query.where('action', '==', options.action);

    const snapshot = await query.orderBy('createdAt', 'desc').limit(limit).get();

    const events = snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as AuditEventDoc }))
      .filter(({ data }) => !options.sensitiveOnly || SENSITIVE_ACTIONS.has(data.action));

    const names = await this.resolveActorNames(events.map(({ data }) => data.actorId));

    return events.map(({ id, data }) => ({
      id,
      action: data.action,
      actor: data.actorId
        ? { id: data.actorId, fullName: names.get(data.actorId) ?? 'Учётная запись удалена' }
        : null,
      targetType: data.targetType,
      targetId: data.targetId,
      metadata: data.metadata,
      createdAt: data.createdAt.toDate().toISOString(),
    }));
  }

  /** Имена авторов добираются отдельно: Firestore не умеет join. */
  private async resolveActorNames(
    actorIds: Array<string | null>,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(actorIds.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();

    const snapshots = await this.db.getAll(
      ...unique.map((id) => this.db.collection(COLLECTIONS.users).doc(id)),
    );

    return new Map(
      snapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => [snapshot.id, (snapshot.data() as UserDoc).fullName]),
    );
  }
}
