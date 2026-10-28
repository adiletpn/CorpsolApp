import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_GRADE_TIERS, gradeForMonth, weekBonus, type GradeTier, type WeekBand } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OfferDoc, OrganizationDoc, UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { localWorkDateKey } from '../common/utils/time';

export interface GradeChange {
  userId: string;
  from: string;
  to: string;
  /** Регистраций за месяц — почему ранг такой. */
  monthCount: number;
}

export interface GradeProgress {
  tier: GradeTier;
  week: {
    start: string;
    end: string;
    count: number;
    band: WeekBand;
    rateMinor: number;
    amountMinor: number;
    /** Сколько ещё до плана недели; 0 — план уже есть. */
    toPlan: number;
  };
  monthCount: number;
  /** Ранг выше и сколько ему не хватает до месячного плана; null — уже старший. */
  next: { code: string; name: string; monthPlan: number; left: number } | null;
}

const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Ранги менеджеров: таблица организации и ранг каждого сотрудника.
 *
 * Пока организация не меняла таблицу, действует «Новая система» из
 * общего пакета. Ранг определяет оклад и ставки, поэтому его смена
 * пишется в журнал — с автором и прежним значением.
 */
@Injectable()
export class GradesService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async tiers(organizationId: string): Promise<GradeTier[]> {
    const snapshot = await this.db.collection(COLLECTIONS.organizations).doc(organizationId).get();
    const stored = (snapshot.data() as OrganizationDoc | undefined)?.gradeTiers;
    return stored && stored.length > 0 ? stored : DEFAULT_GRADE_TIERS;
  }

  async updateTiers(actor: AuthenticatedUser, tiers: GradeTier[]): Promise<GradeTier[]> {
    this.validate(tiers);

    await this.db.collection(COLLECTIONS.organizations).doc(actor.organizationId).update({ gradeTiers: tiers });
    await this.audit(actor, 'grades.update', actor.organizationId, { codes: tiers.map((tier) => tier.code) });
    return tiers;
  }

  /** Перевести сотрудника на ранг. Действует с текущего расчёта. */
  async assign(actor: AuthenticatedUser, userId: string, code: string): Promise<{ userId: string; gradeCode: string }> {
    const tiers = await this.tiers(actor.organizationId);
    if (!tiers.some((tier) => tier.code === code)) {
      throw new BadRequestException(`Ранга «${code}» нет в таблице`);
    }

    const ref = this.db.collection(COLLECTIONS.users).doc(userId);
    const snapshot = await ref.get();
    const user = snapshot.data() as UserDoc | undefined;
    if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }

    await ref.update({ gradeCode: code, updatedAt: Timestamp.now() });
    await this.audit(actor, 'employee.grade', userId, { from: user.gradeCode ?? null, to: code });
    return { userId, gradeCode: code };
  }

  /** Ранг сотрудника из таблицы; без ранга — младший. */
  async tierFor(organizationId: string, user: Pick<UserDoc, 'gradeCode'>): Promise<GradeTier> {
    const tiers = await this.tiers(organizationId);
    return tiers.find((tier) => tier.code === user.gradeCode) ?? this.youngest(tiers);
  }

  /**
   * Пересмотр рангов по итогу месяца: кто сколько регистраций закрыл,
   * тот ранг и получает на следующий месяц — вверх и вниз.
   *
   * Трогаем только тех, у кого ранг уже стоит: остальные получают
   * зарплату по старой схеме, и переводить их молча нельзя.
   */
  async regradeForMonth(organizationId: string, year: number, month: number): Promise<GradeChange[]> {
    const tiers = await this.tiers(organizationId);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;

    const [users, offers] = await Promise.all([
      this.db
        .collection(COLLECTIONS.users)
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'ACTIVE')
        .get(),
      this.db
        .collection(COLLECTIONS.offers)
        .where('organizationId', '==', organizationId)
        .where('sentDate', '>=', `${prefix}-01`)
        .where('sentDate', '<=', `${prefix}-31`)
        .get(),
    ]);

    const counts = new Map<string, number>();
    for (const doc of offers.docs) {
      const offer = doc.data() as OfferDoc;
      if (offer.status === 'ACCEPTED') counts.set(offer.userId, (counts.get(offer.userId) ?? 0) + 1);
    }

    const changes: GradeChange[] = [];
    for (const doc of users.docs) {
      const user = doc.data() as UserDoc;
      if (!user.gradeCode) continue;

      const monthCount = counts.get(doc.id) ?? 0;
      const tier = gradeForMonth(tiers, monthCount);
      if (tier.code === user.gradeCode) continue;

      await doc.ref.update({ gradeCode: tier.code, updatedAt: Timestamp.now() });
      changes.push({ userId: doc.id, from: user.gradeCode, to: tier.code, monthCount });
    }

    // Одна запись на весь пересмотр: автора нет, это не действие человека.
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId,
      actorId: null,
      action: 'grades.monthly',
      targetType: 'Organization',
      targetId: organizationId,
      metadata: { month: prefix, changes },
      ip: null,
      createdAt: Timestamp.now(),
    });

    return changes;
  }

  /**
   * Где менеджер сейчас: регистрации этой недели и ставка, которая на них
   * выходит, и сколько осталось до следующего ранга. Без ранга — null:
   * человек на окладе и правилах, недельных ставок у него нет.
   */
  async progress(organizationId: string, userId: string, now = new Date()): Promise<GradeProgress | null> {
    const userSnapshot = await this.db.collection(COLLECTIONS.users).doc(userId).get();
    const user = userSnapshot.data() as UserDoc | undefined;
    if (!user?.gradeCode || user.organizationId !== organizationId) return null;

    const organization = (await this.db.collection(COLLECTIONS.organizations).doc(organizationId).get()).data() as
      | OrganizationDoc
      | undefined;
    const today = localWorkDateKey(now, organization?.timezone ?? 'Asia/Almaty');
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const weekStart = addDays(today, -weekday);
    const weekEnd = addDays(weekStart, 6);
    const monthStart = `${today.slice(0, 7)}-01`;
    const from = weekStart < monthStart ? weekStart : monthStart;

    const offers = await this.db
      .collection(COLLECTIONS.offers)
      .where('userId', '==', userId)
      .where('sentDate', '>=', from)
      .where('sentDate', '<=', weekEnd)
      .get();
    const dates = offers.docs
      .map((doc) => doc.data() as OfferDoc)
      .filter((offer) => offer.status === 'ACCEPTED')
      .map((offer) => offer.sentDate);

    const tiers = await this.tiers(organizationId);
    const tier = tiers.find((item) => item.code === user.gradeCode) ?? this.youngest(tiers);
    const weekCount = dates.filter((date) => date >= weekStart).length;
    const monthCount = dates.filter((date) => date.startsWith(today.slice(0, 7))).length;
    const bonus = weekBonus(tier, weekCount);
    const higher = [...tiers].sort((a, b) => a.monthPlan - b.monthPlan).find((item) => item.monthPlan > tier.monthPlan);

    return {
      tier,
      week: {
        start: weekStart,
        end: weekEnd,
        count: weekCount,
        band: bonus.band,
        rateMinor: bonus.rateMinor,
        amountMinor: bonus.amountMinor,
        toPlan: Math.max(0, tier.weekPlan - weekCount),
      },
      monthCount,
      next: higher
        ? { code: higher.code, name: higher.name, monthPlan: higher.monthPlan, left: Math.max(0, higher.monthPlan - monthCount) }
        : null,
    };
  }

  youngest(tiers: GradeTier[]): GradeTier {
    return [...tiers].sort((a, b) => a.monthPlan - b.monthPlan)[0];
  }

  private validate(tiers: GradeTier[]): void {
    if (tiers.length === 0) throw new BadRequestException('Нужен хотя бы один ранг');

    const codes = new Set(tiers.map((tier) => tier.code));
    if (codes.size !== tiers.length) throw new BadRequestException('Коды рангов повторяются');

    const plans = new Set(tiers.map((tier) => tier.monthPlan));
    // Два ранга с одним месячным планом — непонятно, какой давать.
    if (plans.size !== tiers.length) throw new BadRequestException('У двух рангов одинаковый месячный план');

    for (const tier of tiers) {
      if (tier.weekPlan <= 0 || tier.monthPlan <= 0) {
        throw new BadRequestException(`Ранг «${tier.name}»: план должен быть больше нуля`);
      }
      if (!(tier.rateUnderMinor <= tier.ratePlanMinor && tier.ratePlanMinor <= tier.rateOverMinor)) {
        throw new BadRequestException(
          `Ранг «${tier.name}»: ставка ниже плана ≤ ставка в план ≤ ставка сверх плана`,
        );
      }
    }
  }

  private async audit(
    actor: AuthenticatedUser,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      targetType: action.startsWith('grades') ? 'Organization' : 'User',
      targetId,
      metadata,
      ip: null,
      createdAt: Timestamp.now(),
    });
  }
}
