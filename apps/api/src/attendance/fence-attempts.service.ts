import { Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { FenceAttemptDoc, UserDoc } from '../firestore/types';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Сколько дней с попытками вне офиса за месяц ведут к выговору.
 *
 * Считаются дни, а не нажатия: человек у двери может нажать трижды
 * за минуту, пока телефон ловит точку, — это одна попытка, а не три.
 */
export const REPRIMAND_AFTER_DAYS = 3;

export interface FenceAttemptResult {
  /** Дней с попытками вне офиса в этом месяце, включая сегодняшний. */
  days: number;
  /** Выговор вынесен этой попыткой. */
  reprimanded: boolean;
}

/**
 * Попытки отметиться дальше геозоны: «не считаем, но отмечаем».
 *
 * Приход не засчитывается, попытка записывается. На третий такой день
 * за месяц — выговор: в журнал, сотруднику, РОП и HR. Выговор один
 * на месяц: дальнейшие попытки копятся, но не множат уведомления.
 */
@Injectable()
export class FenceAttemptsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  async record(
    userId: string,
    user: Pick<UserDoc, 'organizationId' | 'departmentId' | 'fullName'>,
    attempt: Pick<FenceAttemptDoc, 'officeId' | 'workDate' | 'distanceMeters' | 'radiusMeters' | 'lat' | 'lng'>,
  ): Promise<FenceAttemptResult> {
    await this.db.collection(COLLECTIONS.fenceAttempts).doc().set({
      ...attempt,
      userId,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      createdAt: Timestamp.now(),
    } satisfies FenceAttemptDoc);

    const month = attempt.workDate.slice(0, 7);
    // Только по сотруднику: сотрудник плюс диапазон дат требует составного
    // индекса Firestore, без него запрос падал и отметка отвечала ошибкой
    // сервера. Попыток у человека единицы — месяц отбираем здесь.
    const snapshot = await this.db.collection(COLLECTIONS.fenceAttempts).where('userId', '==', userId).get();
    const days = new Set(
      snapshot.docs
        .map((doc) => (doc.data() as FenceAttemptDoc).workDate)
        .filter((workDate) => workDate.startsWith(`${month}-`)),
    ).size;

    // Ровно на третьем дне: четвёртый и дальше уже под этим выговором.
    const reprimanded = days === REPRIMAND_AFTER_DAYS && !(await this.alreadyReprimanded(userId, month));
    if (reprimanded) await this.reprimand(userId, user, month, days);

    return { days, reprimanded };
  }

  private async alreadyReprimanded(userId: string, month: string): Promise<boolean> {
    const snapshot = await this.db
      .collection(COLLECTIONS.auditEvents)
      .where('action', '==', 'attendance.fence_reprimand')
      .where('targetId', '==', userId)
      .get();
    return snapshot.docs.some((doc) => (doc.data() as { metadata?: { month?: string } }).metadata?.month === month);
  }

  private async reprimand(
    userId: string,
    user: Pick<UserDoc, 'organizationId' | 'departmentId' | 'fullName'>,
    month: string,
    days: number,
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId: user.organizationId,
      // Автора нет: выговор выносит правило, а не человек.
      actorId: null,
      action: 'attendance.fence_reprimand',
      targetType: 'User',
      targetId: userId,
      metadata: { month, days },
      ip: null,
      createdAt: Timestamp.now(),
    });

    const refId = `${userId}_${month}`;
    await this.notifications.notifyUser(userId, {
      organizationId: user.organizationId,
      kind: 'fence_reprimand',
      body: `${days} дня в этом месяце отметка была не из офиса. Это выговор — руководитель с вами свяжется.`,
      refType: 'User',
      refId,
    });
    await this.notifications.notifyRole(user.organizationId, ['ROP', 'HR'], {
      kind: 'fence_reprimand',
      body: `${user.fullName}: отметки не из офиса — ${days} дня в этом месяце.`,
      refType: 'User',
      refId,
    });
  }
}
