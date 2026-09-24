import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  calculatePayroll,
  type AttendanceSummary,
  type BonusRule,
  type PayrollResult,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, payrollDocId } from '../firestore/collections';
import type {
  AttendanceDoc,
  BonusRuleDoc,
  PayrollDoc,
  UserDoc,
} from '../firestore/types';
import { PlansService } from '../plans/plans.service';
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

    const result = calculatePayroll({
      baseSalaryMinor: user.baseSalaryMinor,
      attendance,
      planProgress,
      rules,
    });

    return this.persist(user, userId, periodStart, periodEnd, result);
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
      if (record.status === 'ABSENT') summary.absentDays += 1;
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
