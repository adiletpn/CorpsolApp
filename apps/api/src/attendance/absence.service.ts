import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, attendanceDocId } from '../firestore/collections';
import type { AttendanceDoc, OrganizationDoc, UserDoc } from '../firestore/types';
import { findActiveSchedule } from '../schedules/schedule-resolver';
import { localIsoWeekday } from '../common/utils/time';

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

  /** Часовой пояс организации: «вчера» у каждой своё. */
  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }
}
