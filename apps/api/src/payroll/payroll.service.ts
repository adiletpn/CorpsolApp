import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  WEEK_BAND_LABELS,
  calculatePayroll,
  formatMinor,
  monthWeeklyBonuses,
  weeksTouchingMonth,
  type AttendanceSummary,
  type BonusRule,
  type GradeTier,
  type PayrollLine,
  type PayrollResult,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, payrollDocId } from '../firestore/collections';
import type {
  AttendanceDoc,
  BonusRuleDoc,
  OfferDoc,
  OrganizationDoc,
  PayrollAdjustmentDoc,
  PayrollDoc,
  UserDoc,
} from '../firestore/types';
import { PlansService } from '../plans/plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GradesService } from './grades.service';
import { localWorkDateKey } from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface PayrollAdjustmentView {
  id: string;
  userId: string;
  periodStart: string;
  amountMinor: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

/** Последний день месяца для «ГГГГ-ММ-01». */
export function monthEnd(periodStart: string): string {
  const [year, month] = periodStart.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export interface PayrollView extends Omit<PayrollDoc, 'calculatedAt' | 'approvedAt'> {
  id: string;
  calculatedAt: string;
  approvedAt: string | null;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly plans: PlansService,
    private readonly notifications: NotificationsService,
    private readonly grades: GradesService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Расчёт за период. Пересчёт перезаписывает лист по тому же ключу —
   * двух разных сумм за один месяц у сотрудника быть не должно.
   */
  async calculate(
    actor: AuthenticatedUser,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollView> {
    const user = await this.loadUser(actor, userId);
    const result = await this.compute(user, userId, periodStart, periodEnd);
    return this.persist(user, userId, periodStart, periodEnd, result);
  }

  /**
   * Прогноз на сегодня: тот же расчёт за месяц по сегодняшний день,
   * но без записи листа. Сотрудник видит, к чему идёт, каждый день;
   * утверждённая сумма — только та, что в листе.
   */
  async forecast(actor: AuthenticatedUser, now = new Date()) {
    const user = await this.loadUser(actor, actor.id);
    const timezone =
      ((await this.db.collection(COLLECTIONS.organizations).doc(user.organizationId).get()).data() as
        | OrganizationDoc
        | undefined)?.timezone ?? 'Asia/Almaty';
    const today = localWorkDateKey(now, timezone);
    const periodStart = `${today.slice(0, 7)}-01`;

    const result = await this.compute(user, actor.id, periodStart, today);
    return {
      periodStart,
      asOf: today,
      baseSalaryMinor: result.baseSalaryMinor,
      bonusMinor: result.bonusMinor,
      penaltyMinor: result.penaltyMinor,
      totalMinor: result.totalMinor,
      lines: result.lines,
    };
  }

  private async compute(
    user: UserDoc,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollResult> {
    const [rules, attendance, planProgress, adjustments] = await Promise.all([
      this.loadRules(user.organizationId, user.departmentId),
      this.summarizeAttendance(userId, periodStart, periodEnd),
      this.plans.progressForUser(user.organizationId, userId, periodStart),
      this.loadAdjustments(user.organizationId, userId, periodStart),
    ]);

    // С рангом оклад и недельные бонусы — из таблицы рангов; без ранга
    // сотрудник считается по-старому, по окладу из карточки.
    const tier = user.gradeCode ? await this.grades.tierFor(user.organizationId, user) : null;
    const extraBonusLines = tier ? await this.weeklyOfferLines(userId, periodStart, tier) : [];

    return calculatePayroll({
      baseSalaryMinor: tier ? tier.baseSalaryMinor : user.baseSalaryMinor,
      attendance,
      planProgress,
      rules,
      extraBonusLines,
      manualLines: adjustments.map((adjustment) => ({
        ruleId: `manual-${adjustment.id}`,
        kind: 'MANUAL' as const,
        title: adjustment.reason,
        amountMinor: adjustment.amountMinor,
      })),
    });
  }

  /**
   * Бонусы по неделям месяца за принятые регистрации. Выборка берёт
   * и края соседних месяцев: полоса недели на стыке решается по всей
   * неделе, хотя платится только за дни этого месяца.
   */
  private async weeklyOfferLines(userId: string, periodStart: string, tier: GradeTier): Promise<PayrollLine[]> {
    const [year, month] = periodStart.split('-').map(Number);
    const weeks = weeksTouchingMonth(year, month);

    const snapshot = await this.db
      .collection(COLLECTIONS.offers)
      .where('userId', '==', userId)
      .where('sentDate', '>=', weeks[0].start)
      .where('sentDate', '<=', weeks[weeks.length - 1].end)
      .get();

    const dates = snapshot.docs
      .map((doc) => doc.data() as OfferDoc)
      .filter((offer) => offer.status === 'ACCEPTED')
      .map((offer) => offer.sentDate);

    const short = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

    return monthWeeklyBonuses(tier, dates, year, month).map((week) => ({
      ruleId: `week-${week.week.start}`,
      kind: 'WEEKLY_OFFERS' as const,
      // «Неделя 28.09–04.10 · 7 рег., сверх плана · 3 × 5 500 ₸» — видно,
      // почему ставка такая и за сколько регистраций заплачено.
      title:
        `Неделя ${short(week.week.start)}–${short(week.week.end)} · ${week.weekCount} рег., ` +
        `${WEEK_BAND_LABELS[week.band]} · ${week.paidCount} × ${formatMinor(week.rateMinor)}`,
      amountMinor: week.amountMinor,
    }));
  }

  /** Табель за период, свёрнутый до счётчиков для расчёта. */
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
      // Не засчитанный по дозвонам день не отработан — штраф как за прогул.
      if (record.status === 'ABSENT' || record.status === 'NOT_COUNTED') {
        summary.absentDays += 1;
      }
      if (record.status === 'LATE') {
        summary.lateDays += 1;
        summary.totalLateMinutes += record.lateMinutes;
      }
      // Выходные и уважительные причины в счётчики не идут:
      // наказывать за них нечего, премировать тоже.
    }

    return summary;
  }

  /**
   * Правила компании плюс правила отдела. Отдельские идут после общих,
   * поэтому при совпадении срабатывают оба — это осознанно: правило отдела
   * дополняет общее, а не заменяет его.
   */
  private async loadRules(
    organizationId: string,
    departmentId: string | null,
  ): Promise<BonusRule[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.bonusRules)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as BonusRuleDoc }))
      .filter(({ data }) => data.departmentId === null || data.departmentId === departmentId)
      .map(({ id, data }) => ({
        id,
        kind: data.kind,
        metric: data.metric ?? undefined,
        threshold: data.threshold,
        amountMinor: data.amountMinor,
        percentBps: data.percentBps,
      }));
  }

  private async persist(
    user: UserDoc,
    userId: string,
    periodStart: string,
    periodEnd: string,
    result: PayrollResult,
  ): Promise<PayrollView> {
    const doc: PayrollDoc = {
      userId,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      periodStart,
      periodEnd,
      baseSalaryMinor: result.baseSalaryMinor,
      bonusMinor: result.bonusMinor,
      penaltyMinor: result.penaltyMinor,
      totalMinor: result.totalMinor,
      lines: result.lines,
      status: 'DRAFT',
      calculatedAt: Timestamp.now(),
      approvedBy: null,
      approvedAt: null,
    };

    const id = payrollDocId(userId, periodStart);
    await this.db.collection(COLLECTIONS.payrolls).doc(id).set(doc);

    return this.toView(id, doc);
  }

  /**
   * Утверждение расчёта.
   *
   * Пока лист черновик, суммы ещё могут измениться пересчётом — поэтому
   * сотруднику о нём не сообщают. Утверждение фиксирует цифры и служит
   * тем самым поводом: человек узнаёт, сколько ему начислено, не спрашивая.
   */
  async approve(
    actor: AuthenticatedUser,
    userId: string,
    periodStart: string,
  ): Promise<PayrollView> {
    const id = payrollDocId(userId, periodStart);
    const ref = this.db.collection(COLLECTIONS.payrolls).doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) throw new NotFoundException('Расчёт за этот период не найден');

    const doc = snapshot.data() as PayrollDoc;
    if (doc.organizationId !== actor.organizationId) {
      throw new NotFoundException('Расчёт за этот период не найден');
    }

    // Повторное утверждение не сдвигает дату и не шлёт второе сообщение:
    // «зарплата готова» дважды за месяц читается как ошибка в расчёте.
    if (doc.status !== 'DRAFT') return this.toView(id, doc);

    const approvedAt = Timestamp.now();
    await ref.update({ status: 'APPROVED', approvedBy: actor.id, approvedAt });

    await this.notifications.notifyUser(userId, {
      organizationId: doc.organizationId,
      kind: 'payroll_ready',
      body: `За период ${doc.periodStart} — ${doc.periodEnd} начислено ${formatTenge(doc.totalMinor)}`,
      refType: 'Payroll',
      refId: id,
    });

    return this.toView(id, {
      ...doc,
      status: 'APPROVED',
      approvedBy: actor.id,
      approvedAt,
    });
  }

  /**
   * Ручная правка директора: доплата или удержание с причиной. Лист
   * сразу пересчитывается, чтобы сумма в панели совпадала с правками.
   * Утверждённый лист не трогаем — сотруднику уже сообщили сумму.
   */
  async addAdjustment(
    actor: AuthenticatedUser,
    userId: string,
    periodStart: string,
    amountMinor: number,
    reason: string,
  ): Promise<PayrollView> {
    await this.loadUser(actor, userId);
    await this.assertDraft(userId, periodStart);
    if (amountMinor === 0) throw new BadRequestException('Сумма правки не может быть нулевой');

    const ref = this.db.collection(COLLECTIONS.payrollAdjustments).doc();
    await ref.set({
      organizationId: actor.organizationId,
      userId,
      periodStart,
      amountMinor,
      reason: reason.trim(),
      createdBy: actor.id,
      createdAt: Timestamp.now(),
    } satisfies PayrollAdjustmentDoc);
    await this.auditAdjustment(actor, 'payroll.adjust', ref.id, { userId, periodStart, amountMinor, reason: reason.trim() });

    return this.calculate(actor, userId, periodStart, monthEnd(periodStart));
  }

  async removeAdjustment(actor: AuthenticatedUser, adjustmentId: string): Promise<PayrollView> {
    const ref = this.db.collection(COLLECTIONS.payrollAdjustments).doc(adjustmentId);
    const snapshot = await ref.get();
    const adjustment = snapshot.data() as PayrollAdjustmentDoc | undefined;
    if (!snapshot.exists || adjustment?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Правка не найдена');
    }

    await this.assertDraft(adjustment.userId, adjustment.periodStart);
    await ref.delete();
    await this.auditAdjustment(actor, 'payroll.adjust_removed', adjustmentId, {
      userId: adjustment.userId,
      periodStart: adjustment.periodStart,
      amountMinor: adjustment.amountMinor,
      reason: adjustment.reason,
    });

    return this.calculate(actor, adjustment.userId, adjustment.periodStart, monthEnd(adjustment.periodStart));
  }

  async listAdjustments(actor: AuthenticatedUser, periodStart: string): Promise<PayrollAdjustmentView[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.payrollAdjustments)
      .where('organizationId', '==', actor.organizationId)
      .where('periodStart', '==', periodStart)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as PayrollAdjustmentDoc;
      return { id: doc.id, ...data, createdAt: data.createdAt.toDate().toISOString() };
    });
  }

  private async loadAdjustments(organizationId: string, userId: string, periodStart: string) {
    const snapshot = await this.db
      .collection(COLLECTIONS.payrollAdjustments)
      .where('userId', '==', userId)
      .where('periodStart', '==', periodStart)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as PayrollAdjustmentDoc) }))
      .filter((adjustment) => adjustment.organizationId === organizationId);
  }

  private async assertDraft(userId: string, periodStart: string): Promise<void> {
    const snapshot = await this.db.collection(COLLECTIONS.payrolls).doc(payrollDocId(userId, periodStart)).get();
    const status = (snapshot.data() as PayrollDoc | undefined)?.status;
    if (status && status !== 'DRAFT') {
      throw new BadRequestException('Расчёт уже утверждён — правки в него не вносятся');
    }
  }

  private async auditAdjustment(
    actor: AuthenticatedUser,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      targetType: 'PayrollAdjustment',
      targetId,
      metadata,
      ip: null,
      createdAt: Timestamp.now(),
    });
  }

  /** Расчётные листы с учётом области видимости роли. */
  async list(actor: AuthenticatedUser, periodStart?: string): Promise<PayrollView[]> {
    let query = this.db
      .collection(COLLECTIONS.payrolls)
      .where('organizationId', '==', actor.organizationId);

    if (actor.role === 'MOP') {
      query = query.where('userId', '==', actor.id);
    } else if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      query = query.where('departmentId', '==', actor.departmentId);
    }

    if (periodStart) query = query.where('periodStart', '==', periodStart);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => this.toView(doc.id, doc.data() as PayrollDoc));
  }

  private async loadUser(actor: AuthenticatedUser, userId: string): Promise<UserDoc> {
    const snapshot = await this.db.collection(COLLECTIONS.users).doc(userId).get();
    const user = snapshot.data() as UserDoc | undefined;

    if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }
    return user;
  }

  private toView(id: string, doc: PayrollDoc): PayrollView {
    return {
      ...doc,
      id,
      calculatedAt: doc.calculatedAt.toDate().toISOString(),
      approvedAt: doc.approvedAt?.toDate().toISOString() ?? null,
    };
  }
}

/** Сумма для сообщения: тиыны человеку ничего не говорят. */
function formatTenge(amountMinor: number): string {
  return `${Math.round(amountMinor / 100).toLocaleString('ru-RU')} ₸`;
}
