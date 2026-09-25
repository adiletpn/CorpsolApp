import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  calculateAttendanceRates,
  detectRisks,
  mergeAttendance,
  type AttendanceRates,
  type AttendanceSummary,
  type RiskFlag,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type {
  AttendanceDoc,
  DepartmentDoc,
  OfferDoc,
  PlanDoc,
  UserDoc,
} from '../firestore/types';
import { PlansService } from '../plans/plans.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface EmployeeStats {
  userId: string;
  fullName: string;
  rates: AttendanceRates;
  /** Доля выполнения личного плана, либо null, если план не поставлен. */
  planRatio: number | null;
  acceptedOffers: number;
  revenueMinor: number;
  risks: RiskFlag[];
}

export interface DepartmentStats {
  departmentId: string;
  name: string;
  headcount: number;
  rates: AttendanceRates;
  planRatio: number | null;
  acceptedOffers: number;
  revenueMinor: number;
  risks: RiskFlag[];
  /** Заполняется только для РОПа и директора, запросившего конкретный отдел. */
  employees?: EmployeeStats[];
}

export interface CompanyStats {
  periodStart: string;
  periodEnd: string;
  headcount: number;
  rates: AttendanceRates;
  acceptedOffers: number;
  revenueMinor: number;
  departments: DepartmentStats[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly plans: PlansService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Сводка по компании для директора.
   *
   * Данные собираются перебором документов за период. На нынешних объёмах
   * это дёшево, но Firestore берёт плату за каждое чтение, поэтому при росте
   * штата сюда встанут предагрегаты — коллекции для них уже заведены.
   */
  async company(
    actor: AuthenticatedUser,
    periodStart: string,
    periodEnd: string,
  ): Promise<CompanyStats> {
    const [users, departments] = await Promise.all([
      this.loadUsers(actor.organizationId),
      this.loadDepartments(actor.organizationId),
    ]);

    const attendance = await this.loadAttendance(actor.organizationId, periodStart, periodEnd);
    const offers = await this.loadOffers(actor.organizationId, periodStart, periodEnd);

    const stats = await Promise.all(
      [...departments.entries()].map(([departmentId, department]) =>
        this.buildDepartment(
          actor.organizationId,
          departmentId,
          department,
          users,
          attendance,
          offers,
          periodStart,
        ),
      ),
    );

    const companySummary = mergeAttendance([...attendance.values()]);

    return {
      periodStart,
      periodEnd,
      headcount: users.size,
      rates: calculateAttendanceRates(companySummary),
      acceptedOffers: stats.reduce((total, item) => total + item.acceptedOffers, 0),
      revenueMinor: stats.reduce((total, item) => total + item.revenueMinor, 0),
      departments: stats.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    };
  }

  /** Сводка по отделу с разбивкой по сотрудникам — рабочий экран РОПа. */
  async department(
    actor: AuthenticatedUser,
    periodStart: string,
    periodEnd: string,
    requestedDepartmentId?: string,
  ): Promise<DepartmentStats> {
    const departmentId = this.resolveDepartment(actor, requestedDepartmentId);

    const [users, departments] = await Promise.all([
      this.loadUsers(actor.organizationId),
      this.loadDepartments(actor.organizationId),
    ]);

    const department = departments.get(departmentId);
    if (!department) throw new ForbiddenException('Отдел не найден');

    const attendance = await this.loadAttendance(actor.organizationId, periodStart, periodEnd);
    const offers = await this.loadOffers(actor.organizationId, periodStart, periodEnd);

    return this.buildDepartment(
      actor.organizationId,
      departmentId,
      department,
      users,
      attendance,
      offers,
      periodStart,
      true,
    );
  }

  private resolveDepartment(actor: AuthenticatedUser, requested?: string): string {
    if (actor.role === 'DIRECTOR' || actor.role === 'SUPER_ADMIN') {
      if (!requested) throw new ForbiddenException('Укажите отдел');
      return requested;
    }

    if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
    // Чужой отдел РОПу недоступен, даже если он указан явно.
    return actor.departmentId;
  }

  private async buildDepartment(
    organizationId: string,
    departmentId: string,
    department: DepartmentDoc,
    users: Map<string, UserDoc>,
    attendance: Map<string, AttendanceSummary>,
    offers: Map<string, { accepted: number; revenueMinor: number }>,
    periodStart: string,
    withEmployees = false,
  ): Promise<DepartmentStats> {
    const members = [...users.entries()].filter(
      ([, user]) => user.departmentId === departmentId,
    );

    const employees = await Promise.all(
      members.map(async ([userId, user]) => {
        const summary = attendance.get(userId) ?? this.emptySummary();
        const rates = calculateAttendanceRates(summary);
        const planRatio = await this.userPlanRatio(organizationId, userId, periodStart);
        const offer = offers.get(userId) ?? { accepted: 0, revenueMinor: 0 };

        return {
          userId,
          fullName: user.fullName,
          rates,
          planRatio,
          acceptedOffers: offer.accepted,
          revenueMinor: offer.revenueMinor,
          risks: detectRisks(rates, planRatio),
        } satisfies EmployeeStats;
      }),
    );

    const summary = mergeAttendance(
      members.map(([userId]) => attendance.get(userId) ?? this.emptySummary()),
    );
    const rates = calculateAttendanceRates(summary);
    const planRatio = await this.departmentPlanRatio(organizationId, departmentId, periodStart);

    return {
      departmentId,
      name: department.name,
      headcount: members.length,
      rates,
      planRatio,
      acceptedOffers: employees.reduce((total, item) => total + item.acceptedOffers, 0),
      revenueMinor: employees.reduce((total, item) => total + item.revenueMinor, 0),
      risks: detectRisks(rates, planRatio),
      ...(withEmployees
        ? { employees: employees.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')) }
        : {}),
    };
  }

  /** Среднее выполнение личных планов сотрудника, либо null при их отсутствии. */
  private async userPlanRatio(
    organizationId: string,
    userId: string,
    periodStart: string,
  ): Promise<number | null> {
    const progress = await this.plans.progressForUser(organizationId, userId, periodStart);
    if (progress.length === 0) return null;

    const total = progress.reduce((sum, item) => sum + item.ratio, 0);
    return total / progress.length;
  }

  private async departmentPlanRatio(
    organizationId: string,
    departmentId: string,
    periodStart: string,
  ): Promise<number | null> {
    const snapshot = await this.db
      .collection(COLLECTIONS.plans)
      .where('organizationId', '==', organizationId)
      .where('scope', '==', 'DEPARTMENT')
      .where('ownerId', '==', departmentId)
      .where('periodStart', '==', periodStart)
      .get();

    if (snapshot.empty) return null;

    const plans = snapshot.docs.map((doc) => doc.data() as PlanDoc);
    const progress = await Promise.all(
      plans.map((plan) => this.plans.progressForPlan(plan)),
    );

    const total = progress.reduce((sum, item) => sum + item.ratio, 0);
    return total / progress.length;
  }

  private async loadUsers(organizationId: string): Promise<Map<string, UserDoc>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .get();

    const users = new Map<string, UserDoc>();
    for (const doc of snapshot.docs) {
      const user = doc.data() as UserDoc;
      // В показателях работы участвуют те, кто работает с клиентами.
      if (user.role === 'MOP' || user.role === 'ROP') users.set(doc.id, user);
    }
    return users;
  }

  private async loadDepartments(organizationId: string): Promise<Map<string, DepartmentDoc>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.departments)
      .where('organizationId', '==', organizationId)
      .get();

    return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as DepartmentDoc]));
  }

  /** Табель за период, свёрнутый по сотрудникам. */
  private async loadAttendance(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<string, AttendanceSummary>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.attendance)
      .where('organizationId', '==', organizationId)
      .where('workDate', '>=', periodStart)
      .where('workDate', '<=', periodEnd)
      .get();

    const byUser = new Map<string, AttendanceSummary>();

    for (const doc of snapshot.docs) {
      const record = doc.data() as AttendanceDoc;
      const summary = byUser.get(record.userId) ?? this.emptySummary();

      if (record.status === 'ON_TIME') summary.onTimeDays += 1;
      if (record.status === 'ABSENT') summary.absentDays += 1;
      if (record.status === 'LATE') {
        summary.lateDays += 1;
        summary.totalLateMinutes += record.lateMinutes;
      }

      byUser.set(record.userId, summary);
    }

    return byUser;
  }

  private async loadOffers(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<string, { accepted: number; revenueMinor: number }>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.offers)
      .where('organizationId', '==', organizationId)
      .where('sentDate', '>=', periodStart)
      .where('sentDate', '<=', periodEnd)
      .get();

    const byUser = new Map<string, { accepted: number; revenueMinor: number }>();

    for (const doc of snapshot.docs) {
      const offer = doc.data() as OfferDoc;
      // В выручку идут только подтверждённые сделки.
      if (offer.status !== 'ACCEPTED') continue;

      const current = byUser.get(offer.userId) ?? { accepted: 0, revenueMinor: 0 };
      current.accepted += 1;
      current.revenueMinor += offer.amountMinor;
      byUser.set(offer.userId, current);
    }

    return byUser;
  }

  private emptySummary(): AttendanceSummary {
    return { onTimeDays: 0, lateDays: 0, absentDays: 0, totalLateMinutes: 0 };
  }
}
