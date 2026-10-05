import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ACHIEVEMENTS,
  earnedAchievements,
  type AchievementCode,
  type AttendanceSummary,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import {
  COLLECTIONS,
  pointsDocId,
  userAchievementDocId,
} from '../firestore/collections';
import type { AttendanceDoc, OfferDoc, PointsDoc } from '../firestore/types';
import { PlansService } from '../plans/plans.service';

export interface AchievementView {
  code: AchievementCode;
  title: string;
  description: string;
  points: number;
  /** Когда получена, либо null — тогда это ещё цель, а не достижение. */
  unlockedAt: string | null;
}

export interface AwardResult {
  userId: string;
  /** Ачивки, выданные именно сейчас. Ранее полученные сюда не попадают. */
  newlyEarned: AchievementCode[];
  pointsAwarded: number;
}

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly plans: PlansService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Проверяет показатели сотрудника за период и выдаёт заслуженные ачивки.
   *
   * Повторный запуск безопасен: ачивка лежит под ключом из сотрудника и кода,
   * а начисление очков — под ключом из причины и объекта. Второй раз
   * ни то, ни другое не создастся.
   */
  async evaluate(
    organizationId: string,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<AwardResult> {
    const [attendance, acceptedOffers, planProgress] = await Promise.all([
      this.summarizeAttendance(userId, periodStart, periodEnd),
      this.countAcceptedOffers(userId, periodStart, periodEnd),
      this.plans.progressForUser(organizationId, userId, periodStart),
    ]);

    const earned = earnedAchievements({ attendance, planProgress, acceptedOffers });
    if (earned.length === 0) {
      return { userId, newlyEarned: [], pointsAwarded: 0 };
    }

    const alreadyHave = await this.loadExisting(userId, earned);
    const fresh = earned.filter((code) => !alreadyHave.has(code));

    if (fresh.length === 0) {
      return { userId, newlyEarned: [], pointsAwarded: 0 };
    }

    const pointsAwarded = await this.grant(userId, fresh, periodStart);

    this.logger.log(
      `Сотрудник ${userId}: выданы ачивки ${fresh.join(', ')} на ${pointsAwarded} очков`,
    );

    return { userId, newlyEarned: fresh, pointsAwarded };
  }

  private async loadExisting(
    userId: string,
    codes: AchievementCode[],
  ): Promise<Set<AchievementCode>> {
    const snapshots = await this.db.getAll(
      ...codes.map((code) =>
        this.db.collection(COLLECTIONS.userAchievements).doc(userAchievementDocId(userId, code)),
      ),
    );

    const existing = new Set<AchievementCode>();
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) existing.add(codes[index]);
    });

    return existing;
  }

  /** Записывает ачивки и начисляет очки одним пакетом. */
  private async grant(
    userId: string,
    codes: AchievementCode[],
    periodStart: string,
  ): Promise<number> {
    const batch = this.db.batch();
    const now = Timestamp.now();
    let total = 0;

    for (const code of codes) {
      const definition = ACHIEVEMENTS[code];
      total += definition.points;

      batch.set(
        this.db.collection(COLLECTIONS.userAchievements).doc(userAchievementDocId(userId, code)),
        { userId, achievementCode: code, unlockedAt: now },
      );

      // Период входит в ссылку начисления: ачивка выдаётся один раз,
      // но очки должны попасть в рейтинг того месяца, когда заслужены.
      const entry: PointsDoc = {
        userId,
        reason: 'PLAN_COMPLETED',
        points: definition.points,
        refType: 'Achievement',
        refId: `${code}_${periodStart}`,
        comment: definition.title,
        createdAt: now,
      };

      batch.set(
        this.db
          .collection(COLLECTIONS.points)
          .doc(pointsDocId(userId, 'PLAN_COMPLETED', 'Achievement', `${code}_${periodStart}`)),
        entry,
      );
    }

    await batch.commit();
    return total;
  }

  private async summarizeAttendance(
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<AttendanceSummary> {
    const snapshot = await this.db
      .collection(COLLECTIONS.attendance)
      .where('userId', '==', userId)
      .where('workDate', '>=', periodStart)
      .where('workDate', '<=', periodEnd)
      .get();

    const summary: AttendanceSummary = {
      onTimeDays: 0,
      lateDays: 0,
      absentDays: 0,
      totalLateMinutes: 0,
    };

    for (const doc of snapshot.docs) {
      const record = doc.data() as AttendanceDoc;

      if (record.status === 'ON_TIME') summary.onTimeDays += 1;
      if (record.status === 'ABSENT') summary.absentDays += 1;
      if (record.status === 'LATE') {
        summary.lateDays += 1;
        summary.totalLateMinutes += record.lateMinutes;
      }
    }

    return summary;
  }

  private async countAcceptedOffers(
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    const snapshot = await this.db
      .collection(COLLECTIONS.offers)
      .where('userId', '==', userId)
      .where('sentDate', '>=', periodStart)
      .where('sentDate', '<=', periodEnd)
      .get();

    return snapshot.docs.filter((doc) => (doc.data() as OfferDoc).status === 'ACCEPTED').length;
  }
}
