import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  PayrollDoc,
  UserDoc,
} from '../firestore/types';
import { PlansService } from '../plans/plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GradesService } from './grades.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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

    const [rules, attendance, planProgress] = await Promise.all([
      this.loadRules(actor.organizationId, user.departmentId),
      this.summarizeAttendance(userId, periodStart, periodEnd),
      this.plans.progressForUser(actor.organizationId, userId, periodStart),
    ]);

    // С рангом оклад и недельные бонусы — из таблицы рангов; без ранга
    // сотрудник считается по-старому, по окладу из карточки.
    const tier = user.gradeCode ? await this.grades.tierFor(actor.organizationId, user) : null;
    const extraBonusLines = tier ? await this.weeklyOfferLines(userId, periodStart, tier) : [];

    const result = calculatePayroll({
      baseSalaryMinor: tier ? tier.baseSalaryMinor : user.baseSalaryMinor,
      attendance,
      planProgress,
      rules,
      extraBonusLines,
    });

    return this.persist(user, userId, periodStart, periodEnd, result);
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
