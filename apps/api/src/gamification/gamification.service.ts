import { ForbiddenException, Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  rankEntries,
  topWithSelf,
  type LeaderboardEntry,
  type RankedEntry,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { PointsDoc, UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface LeaderboardResult {
  /** Отдел, по которому построен рейтинг, либо null для всей компании. */
  departmentId: string | null;
  periodStart: string;
  periodEnd: string;
  entries: RankedEntry[];
  /** Место запрашивающего — даже если он не попал в показанную верхушку. */
  self: RankedEntry | null;
}

@Injectable()
export class GamificationService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Рейтинг за период.
   *
   * МОП видит рейтинг своего отдела: соревноваться с коллегами из соседнего
   * отдела бессмысленно, а по ТЗ он и не должен видеть компанию целиком.
   * Руководители видят свой отдел, директор — любой.
   */
  async leaderboard(
    actor: AuthenticatedUser,
    periodStart: string,
    periodEnd: string,
    requestedDepartmentId?: string,
  ): Promise<LeaderboardResult> {
    const departmentId = this.resolveScope(actor, requestedDepartmentId);

    const members = await this.loadMembers(actor.organizationId, departmentId);
    if (members.size === 0) {
      return { departmentId, periodStart, periodEnd, entries: [], self: null };
    }

    const points = await this.sumPoints(members, periodStart, periodEnd);

    const entries: LeaderboardEntry[] = [...members.entries()].map(([userId, user]) => ({
      userId,
      fullName: user.fullName,
      points: points.get(userId)?.total ?? 0,
      breakdown: points.get(userId)?.byReason ?? {},
    }));

    const ranked = rankEntries(entries);
    const self = ranked.find((entry) => entry.userId === actor.id) ?? null;

    return {
      departmentId,
      periodStart,
      periodEnd,
      // Показываем верхушку и самого сотрудника: без своего места
      // рейтинг не мотивирует, а только перечисляет чужие успехи.
      entries: topWithSelf(ranked, actor.id, 10),
      self,
    };
  }

  /** Личная сводка очков — для экрана сотрудника. */
  async myPoints(
    actor: AuthenticatedUser,
    periodStart: string,
    periodEnd: string,
  ): Promise<{ total: number; byReason: Record<string, number> }> {
    const snapshot = await this.db
      .collection(COLLECTIONS.points)
      .where('userId', '==', actor.id)
      .get();

    return this.accumulate(
      snapshot.docs
        .map((doc) => doc.data() as PointsDoc)
        .filter((doc) => this.withinPeriod(doc, periodStart, periodEnd)),
    );
  }

  private resolveScope(
    actor: AuthenticatedUser,
    requested?: string,
  ): string | null {
    if (actor.role === 'DIRECTOR' || actor.role === 'SUPER_ADMIN') {
      return requested ?? null;
    }

    if (!actor.departmentId) {
      throw new ForbiddenException('Сотрудник не привязан к отделу');
    }
    // Запрос чужого отдела молча подменяется своим, а не отклоняется:
    // рейтинг — не то место, где стоит показывать ошибку доступа.
    return actor.departmentId;
  }

  private async loadMembers(
    organizationId: string,
    departmentId: string | null,
  ): Promise<Map<string, UserDoc>> {
    let query = this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE');

    if (departmentId) query = query.where('departmentId', '==', departmentId);

    const snapshot = await query.get();

    const members = new Map<string, UserDoc>();
    for (const doc of snapshot.docs) {
      const user = doc.data() as UserDoc;
      // В рейтинге соревнуются менеджеры. Директор и ЧР в нём не участвуют:
      // им не за что начислять очки, и нулями они бы только мешали.
      if (user.role === 'MOP' || user.role === 'ROP') {
        members.set(doc.id, user);
      }
    }
    return members;
  }

  private async sumPoints(
    members: Map<string, UserDoc>,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<string, { total: number; byReason: Record<string, number> }>> {
    const result = new Map<string, { total: number; byReason: Record<string, number> }>();

    // Firestore ограничивает «in» десятью значениями, поэтому читаем
    // начисления по каждому сотруднику отдельно.
    await Promise.all(
      [...members.keys()].map(async (userId) => {
        const snapshot = await this.db
          .collection(COLLECTIONS.points)
          .where('userId', '==', userId)
          .get();

        const entries = snapshot.docs
          .map((doc) => doc.data() as PointsDoc)
          .filter((doc) => this.withinPeriod(doc, periodStart, periodEnd));

        result.set(userId, this.accumulate(entries));
      }),
    );

    return result;
  }

  private withinPeriod(doc: PointsDoc, periodStart: string, periodEnd: string): boolean {
    const date = this.dateKeyOf(doc.createdAt);
    return date >= periodStart && date <= periodEnd;
  }

  private dateKeyOf(timestamp: Timestamp): string {
    return timestamp.toDate().toISOString().slice(0, 10);
  }

  private accumulate(entries: PointsDoc[]): {
    total: number;
    byReason: Record<string, number>;
  } {
    const byReason: Record<string, number> = {};
    let total = 0;

    for (const entry of entries) {
      total += entry.points;
      byReason[entry.reason] = (byReason[entry.reason] ?? 0) + entry.points;
    }

    return { total, byReason };
  }
}
