import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  NOTIFICATION_TITLES,
  type NotificationKind,
  type Role,
} from '@corpsol/shared';

import { COLLECTIONS, notificationDocId } from '../firestore/collections';
import { FirebaseService } from '../firebase/firebase.service';
import type { NotificationDoc, UserDoc } from '../firestore/types';

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotifyInput {
  organizationId: string;
  kind: NotificationKind;
  body: string;
  refType?: string;
  refId?: string;
}

/**
 * Уведомления внутри системы.
 *
 * Собственного транспорта нет: ни почты, ни пушей. Запись ложится в базу,
 * панель показывает её списком. Этого хватает, чтобы заявка на смену
 * телефона не висела незамеченной неделю.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /** Уведомление конкретному человеку. */
  async notifyUser(userId: string, input: NotifyInput): Promise<void> {
    const record: NotificationDoc = {
      organizationId: input.organizationId,
      userId,
      kind: input.kind,
      title: NOTIFICATION_TITLES[input.kind],
      body: input.body,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      createdAt: Timestamp.now(),
      readAt: null,
    };

    // Ключ детерминированный: повторная обработка того же события
    // не завалит человека копиями одного сообщения. Существующую
    // запись не трогаем — иначе прочитанное всплывало бы снова.
    const ref = this.db
      .collection(COLLECTIONS.notifications)
      .doc(notificationDocId(userId, input.kind, input.refId ?? 'global'));

    await ref.create(record).catch(() => undefined);
  }

  /**
   * Уведомление всем, кто носит роль.
   *
   * Адресовать саму роль нельзя: тогда непонятно, кто уже прочитал
   * и кто взялся за дело. Поэтому по записи на человека.
   */
  async notifyRole(
    organizationId: string,
    roles: readonly Role[],
    input: Omit<NotifyInput, 'organizationId'>,
  ): Promise<void> {
    const snapshot = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .get();

    const recipients = snapshot.docs.filter((doc) =>
      roles.includes((doc.data() as UserDoc).role as Role),
    );

    if (recipients.length === 0) {
      // Не ошибка, но признак дыры в настройке: событие требует
      // действия, а исполнителя в организации нет.
      this.logger.warn(
        `Некому показать «${NOTIFICATION_TITLES[input.kind]}»: нет активных ${roles.join(', ')}`,
      );
      return;
    }

    await Promise.all(
      recipients.map((doc) =>
        this.notifyUser(doc.id, { ...input, organizationId }),
      ),
    );
  }

  /** Свои уведомления, свежие сверху. */
  async list(userId: string, limit = 30): Promise<NotificationView[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.notifications)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs
      .map((doc) => this.toView(doc.id, doc.data() as NotificationDoc))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  /** Сколько непрочитанных — число на колокольчике. */
  async unreadCount(userId: string): Promise<number> {
    const snapshot = await this.db
      .collection(COLLECTIONS.notifications)
      .where('userId', '==', userId)
      .where('readAt', '==', null)
      .get();

    return snapshot.size;
  }

  /** Отметить прочитанным. Повторный вызов время прочтения не сдвигает. */
  async markRead(userId: string, notificationId: string): Promise<void> {
    const ref = this.db.collection(COLLECTIONS.notifications).doc(notificationId);
    const snapshot = await ref.get();
    const data = snapshot.data() as NotificationDoc | undefined;

    // Чужое уведомление прочитанным не отмечаем: идентификатор
    // угадывается, а список — это личные данные.
    if (!data || data.userId !== userId || data.readAt) return;

    await ref.update({ readAt: Timestamp.now() });
  }

  /** Отметить всё разом: иначе список из тридцати штук не разобрать. */
  async markAllRead(userId: string): Promise<number> {
    const snapshot = await this.db
      .collection(COLLECTIONS.notifications)
      .where('userId', '==', userId)
      .where('readAt', '==', null)
      .get();

    if (snapshot.empty) return 0;

    const batch = this.db.batch();
    const now = Timestamp.now();
    for (const doc of snapshot.docs) batch.update(doc.ref, { readAt: now });
    await batch.commit();

    return snapshot.size;
  }

  private toView(id: string, doc: NotificationDoc): NotificationView {
    return {
      id,
      kind: doc.kind,
      title: doc.title,
      body: doc.body,
      refType: doc.refType,
      refId: doc.refId,
      createdAt: doc.createdAt.toDate().toISOString(),
      readAt: doc.readAt?.toDate().toISOString() ?? null,
    };
  }
}
