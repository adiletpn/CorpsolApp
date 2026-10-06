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

  /** Часовой пояс организации: «вчера» у каждой своё. */
  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }
}
