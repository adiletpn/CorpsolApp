import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_GRADE_TIERS, type GradeTier } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type { OrganizationDoc, UserDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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
