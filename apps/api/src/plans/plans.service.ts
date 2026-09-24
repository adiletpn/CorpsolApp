import { BadRequestException, Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { calculateProgress, type PlanMetric, type PlanProgress } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, planDocId } from '../firestore/collections';
import type { CallDoc, OfferDoc, PlanDoc } from '../firestore/types';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CreatePlanDto } from './dto';

export interface PlanView {
  id: string;
  scope: PlanDoc['scope'];
  ownerId: string;
  metric: PlanMetric;
  periodStart: string;
  periodEnd: string;
  progress: PlanProgress;
}

const SECONDS_PER_MINUTE = 60;

@Injectable()
export class PlansService {
  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async create(actor: AuthenticatedUser, dto: CreatePlanDto): Promise<PlanView> {
    if (dto.periodEnd < dto.periodStart) {
      throw new BadRequestException('Конец периода раньше начала');
    }

    const doc: PlanDoc = {
      scope: dto.scope,
      organizationId: actor.organizationId,
      ownerId: dto.ownerId,
      metric: dto.metric,
      target: dto.target,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      createdBy: actor.id,
      createdAt: Timestamp.now(),
    };

    // Ключ детерминированный, поэтому повторная постановка плана на тот же
    // период просто уточняет цифру, а не плодит второй противоречащий план.
    const id = planDocId(dto.scope, dto.ownerId, dto.metric, dto.periodStart);
    await this.db.collection(COLLECTIONS.plans).doc(id).set(doc);

    return this.toView(id, doc);
  }

  /**
   * Планы, которые вправе видеть запрашивающий.
   *
   * МОП по ТЗ видит свой личный план и общий план отдела, но не планы
   * коллег поимённо — поэтому чужие личные планы отсекаются здесь.
   */
  async listVisible(actor: AuthenticatedUser, periodStart?: string): Promise<PlanView[]> {
    let query = this.db
      .collection(COLLECTIONS.plans)
      .where('organizationId', '==', actor.organizationId);

    if (periodStart) query = query.where('periodStart', '==', periodStart);

    const snapshot = await query.get();
    const plans = snapshot.docs.map((doc) => ({ id: doc.id, doc: doc.data() as PlanDoc }));

    const visible = plans.filter(({ doc }) => this.isVisibleTo(actor, doc));

    return Promise.all(visible.map(({ id, doc }) => this.toView(id, doc)));
  }

  private isVisibleTo(actor: AuthenticatedUser, plan: PlanDoc): boolean {
    if (actor.role === 'DIRECTOR' || actor.role === 'SUPER_ADMIN') return true;

    if (actor.role === 'ROP') {
      // Руководитель видит и общий план отдела, и личные планы подчинённых.
      return plan.scope === 'DEPARTMENT'
        ? plan.ownerId === actor.departmentId
        : true;
    }

    if (actor.role === 'MOP') {
      return plan.scope === 'DEPARTMENT'
        ? plan.ownerId === actor.departmentId
        : plan.ownerId === actor.id;
    }

    return false;
  }

  private async toView(id: string, doc: PlanDoc): Promise<PlanView> {
    const achieved = await this.measure(doc);

    return {
      id,
      scope: doc.scope,
      ownerId: doc.ownerId,
      metric: doc.metric,
      periodStart: doc.periodStart,
      periodEnd: doc.periodEnd,
      progress: calculateProgress(doc.metric, doc.target, achieved),
    };
  }

  /** Фактическое значение метрики за период плана. */
  private async measure(plan: PlanDoc): Promise<number> {
    switch (plan.metric) {
      case 'CALLS':
      case 'TALK_MINUTES':
        return this.measureCalls(plan);
      case 'OFFERS':
      case 'REVENUE':
        return this.measureOffers(plan);
    }
  }

  private async measureCalls(plan: PlanDoc): Promise<number> {
    let query = this.db
      .collection(COLLECTIONS.calls)
      .where('callDate', '>=', plan.periodStart)
      .where('callDate', '<=', plan.periodEnd);

    query =
      plan.scope === 'USER'
        ? query.where('userId', '==', plan.ownerId)
        : query.where('departmentId', '==', plan.ownerId);

    const snapshot = await query.get();
    const calls = snapshot.docs.map((doc) => doc.data() as CallDoc);

    if (plan.metric === 'CALLS') {
      // Считаем только состоявшиеся разговоры: набранные номера
      // без ответа не работа, а её видимость.
      return calls.filter((call) => call.status === 'ANSWERED').length;
    }

    const seconds = calls.reduce((total, call) => total + call.talkSeconds, 0);
    return Math.floor(seconds / SECONDS_PER_MINUTE);
  }

  private async measureOffers(plan: PlanDoc): Promise<number> {
    let query = this.db
      .collection(COLLECTIONS.offers)
      .where('sentDate', '>=', plan.periodStart)
      .where('sentDate', '<=', plan.periodEnd);

    query =
      plan.scope === 'USER'
        ? query.where('userId', '==', plan.ownerId)
        : query.where('departmentId', '==', plan.ownerId);

    const snapshot = await query.get();
    const offers = snapshot.docs.map((doc) => doc.data() as OfferDoc);

    // План закрывают принятые офферы, а не отправленные: иначе его
    // выполняли бы рассылкой предложений без единой сделки.
    const accepted = offers.filter((offer) => offer.status === 'ACCEPTED');

    return plan.metric === 'OFFERS'
      ? accepted.length
      : accepted.reduce((total, offer) => total + offer.amountMinor, 0);
  }
}
