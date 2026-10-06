import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, attendanceDocId } from '../firestore/collections';
import type { AttendanceDoc, OrganizationDoc, UserDoc } from '../firestore/types';
import { findActiveSchedule } from '../schedules/schedule-resolver';
import { localIsoWeekday, localWorkDateKey } from '../common/utils/time';

export interface AbsenceRunResult {
  organizationId: string;
  workDate: string;
  /** Сколько сотрудников проверено: у кого была смена по графику. */
  expected: number;
  marked: number;
}

/**
 * Простановка прогулов за прошедший день.
 *
 * Без неё день без отметки остаётся пустым: в табеле его просто нет,
 * в расчёт зарплаты он не попадает, и невыход ничем не отличается
 * от выходного. Прогул должен появляться сам, а не по памяти руководителя.
 */
@Injectable()
export class AbsenceService {
  private readonly logger = new Logger(AbsenceService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Проставляет прогулы за указанный день одной организации.
   *
   * Повторный запуск безопасен: день, по которому уже есть запись,
   * не трогается вовсе — ни отметка прихода, ни выходной, ни правка
   * руководителя не должны затираться ночной задачей.
   */
  async markForOrganization(
    organizationId: string,
    workDate: string,
  ): Promise<AbsenceRunResult> {
    const timezone = await this.timezoneOf(organizationId);
    const staff = await this.workingStaff(organizationId);

    // Полдень локального дня: час внутри суток не важен, а от границы
    // он достаточно далеко, чтобы пояс не сдвинул дату.
    const at = new Date(`${workDate}T12:00:00Z`);

    let expected = 0;
    const toMark: Array<[string, UserDoc]> = [];

    for (const [userId, user] of staff) {
      if (!this.wasEmployed(user, workDate)) continue;
      if (!(await this.wasExpectedToWork(userId, user, at, timezone))) continue;

      expected += 1;

      const existing = await this.db
        .collection(COLLECTIONS.attendance)
        .doc(attendanceDocId(userId, workDate))
        .get();

      if (!existing.exists) toMark.push([userId, user]);
    }

    await this.writeAbsences(organizationId, workDate, toMark);

    if (toMark.length > 0) {
      await this.audit(organizationId, workDate, toMark.map(([userId]) => userId));
    }

    return { organizationId, workDate, expected, marked: toMark.length };
  }

  /**
   * Числился ли сотрудник в штате в этот день.
   *
   * Принятому в среду не ставим прогулы за понедельник и вторник,
   * а уволенному — за дни после ухода.
   */
  private wasEmployed(user: UserDoc, workDate: string): boolean {
    const hired = user.hiredAt.toDate().toISOString().slice(0, 10);
    if (workDate < hired) return false;

    if (!user.terminatedAt) return true;
    return workDate <= user.terminatedAt.toDate().toISOString().slice(0, 10);
  }

  /**
   * Был ли этот день рабочим для сотрудника.
   *
   * Нет графика — нет и прогула: мы не знаем, должен ли он был выйти,
   * а наказывать по догадке нельзя.
   */
  private async wasExpectedToWork(
    userId: string,
    user: UserDoc,
    at: Date,
    timezone: string,
  ): Promise<boolean> {
    const schedule = await findActiveSchedule(this.db, userId, user.departmentId, at);
    if (!schedule) return false;

    return schedule.workdays.includes(localIsoWeekday(at, timezone));
  }

  /**
   * Кто должен был выйти в этот день.
   *
   * Берём только тех, кто работает с клиентами и числится активным:
   * у директора и кадровика смен в табеле нет.
   */
  private async workingStaff(organizationId: string): Promise<Map<string, UserDoc>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'ACTIVE')
      .get();

    const staff = new Map<string, UserDoc>();
    for (const doc of snapshot.docs) {
      const user = doc.data() as UserDoc;
      if (user.role === 'MOP' || user.role === 'ROP') staff.set(doc.id, user);
    }
    return staff;
  }

  /**
   * Ночной прогон. Три часа — время, когда вчерашний день закрыт
   * в любом из поясов, где мы работаем, а нагрузки на базу нет.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runNightly(): Promise<void> {
    const results = await this.markYesterdayEverywhere();
    const marked = results.reduce((total, item) => total + item.marked, 0);

    this.logger.log(
      `Прогулы проставлены: ${marked} в ${results.length} организациях`,
    );
  }

  /**
   * Прогон по всем организациям за их собственное «вчера».
   *
   * Дата считается по часовому поясу каждой: в одно и то же мгновение
   * у одной организации уже вчера, а у другой ещё сегодня.
   */
  async markYesterdayEverywhere(now = new Date()): Promise<AbsenceRunResult[]> {
    const organizations = await this.db.collection(COLLECTIONS.organizations).get();
    const results: AbsenceRunResult[] = [];

    for (const doc of organizations.docs) {
      const timezone = (doc.data() as OrganizationDoc).timezone ?? 'Asia/Almaty';
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const workDate = localWorkDateKey(yesterday, timezone);

      try {
        results.push(await this.markForOrganization(doc.id, workDate));
      } catch (cause) {
        // Падение по одной организации не должно оставить без прогулов
        // все остальные.
        this.logger.error(
          `Прогулы за ${workDate} не проставлены в организации ${doc.id}: ${String(cause)}`,
        );
      }
    }

    return results;
  }

  /**
   * Одна запись в журнал на весь прогон, а не на каждого сотрудника.
   *
   * Прогулы ставит система, и построчный журнал на сотню человек только
   * засорил бы ленту, в которой ищут ручные обходы контроля.
   */
  private async audit(
    organizationId: string,
    workDate: string,
    userIds: string[],
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId,
      // Автора нет: это не действие человека.
      actorId: null,
      action: 'attendance.auto_absence',
      targetType: 'Attendance',
      targetId: workDate,
      metadata: { workDate, userIds, count: userIds.length },
      ip: null,
      createdAt: Timestamp.now(),
    });
  }

  /** Записывает прогулы пачкой: по одному запросу на сотрудника дорого. */
  private async writeAbsences(
    organizationId: string,
    workDate: string,
    entries: Array<[string, UserDoc]>,
  ): Promise<void> {
    if (entries.length === 0) return;

    const batch = this.db.batch();
    const now = Timestamp.now();

    for (const [userId, user] of entries) {
      const record: AttendanceDoc = {
        userId,
        organizationId,
        departmentId: user.departmentId,
        officeId: user.officeId,
        terminalId: null,
        workDate,
        checkInAt: null,
        checkOutAt: null,
        status: 'ABSENT',
        lateMinutes: 0,
        // Источник виден в табеле: это не отметка человека, а вывод системы.
        method: 'AUTO_ABSENCE',
        lat: null,
        lng: null,
        accuracyMeters: null,
        distanceMeters: null,
        wifiBssid: null,
        isMocked: false,
        adjustedBy: null,
        adjustNote: null,
        createdAt: now,
      };

      batch.create(
        this.db.collection(COLLECTIONS.attendance).doc(attendanceDocId(userId, workDate)),
        record,
      );
    }

    await batch.commit();
  }

  /** Часовой пояс организации: «вчера» у каждой своё. */
  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }
}
