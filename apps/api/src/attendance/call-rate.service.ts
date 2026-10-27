import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Timestamp } from 'firebase-admin/firestore';
import { MIN_DAILY_CALL_RATE_BPS } from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS } from '../firestore/collections';
import type {
  AttendanceDoc,
  CallCheck,
  CallDoc,
  OrganizationDoc,
  UserDoc,
} from '../firestore/types';
import { JobLockService } from '../common/jobs/job-lock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { localWorkDateKey } from '../common/utils/time';

export interface CallRateRunResult {
  organizationId: string;
  workDate: string;
  /** Сколько отмеченных дней менеджеров проверено. */
  checked: number;
  notCounted: number;
  /** Сколько дней вернулось в зачёт после догрузки звонков. */
  restored: number;
}

/**
 * Проверка дозвонов за прошедший день.
 *
 * Менеджер по продажам, который пришёл в офис, но дозвонился меньше чем
 * до трёх четвертей клиентов, день не отработал. Такой день получает
 * статус «Не засчитан», и в расчёте он идёт наравне с прогулом.
 */
@Injectable()
export class CallRateService {
  private readonly logger = new Logger(CallRateService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly locks: JobLockService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Проверяет дозвоны за день одной организации.
   *
   * Повторный запуск безопасен и нужен: выгрузку Kcell загружают руками,
   * и звонки за день могут появиться позже ночного прогона. Тогда день,
   * не засчитанный по неполным данным, возвращается к статусу по приходу.
   */
  async checkForOrganization(
    organizationId: string,
    workDate: string,
  ): Promise<CallRateRunResult> {
    const days = await this.db
      .collection(COLLECTIONS.attendance)
      .where('organizationId', '==', organizationId)
      .where('workDate', '==', workDate)
      .get();

    const managers = await this.managers(organizationId);
    const result: CallRateRunResult = {
      organizationId,
      workDate,
      checked: 0,
      notCounted: 0,
      restored: 0,
    };
    const failedUserIds: string[] = [];

    for (const doc of days.docs) {
      const record = doc.data() as AttendanceDoc;
      const statusBefore = this.statusByArrival(record);

      if (!statusBefore || !managers.has(record.userId)) continue;

      result.checked += 1;

      const { outbound, answered } = await this.countCalls(record.userId, workDate);
      const callCheck: CallCheck = {
        outbound,
        answered,
        rateBps: outbound === 0 ? 0 : Math.floor((answered * 10_000) / outbound),
        statusBefore,
        checkedAt: Timestamp.now(),
      };

      // Ни одного исходящего — день не отработан: пришёл, но не звонил.
      // Сравнение в целых числах, чтобы 75% ровно не провалилось на округлении.
      const passed = outbound > 0 && answered * 10_000 >= outbound * MIN_DAILY_CALL_RATE_BPS;
      const status = passed ? statusBefore : 'NOT_COUNTED';

      if (status === 'NOT_COUNTED' && record.status !== 'NOT_COUNTED') {
        result.notCounted += 1;
        failedUserIds.push(record.userId);
        await this.notifyFailed(organizationId, record.userId, workDate, callCheck);
      }
      if (status !== 'NOT_COUNTED' && record.status === 'NOT_COUNTED') {
        result.restored += 1;
      }

      await doc.ref.update({ status, callCheck });
    }

    if (failedUserIds.length > 0) {
      await this.audit(organizationId, workDate, failedUserIds);
    }

    return result;
  }

  /**
   * Статус дня по самому приходу, если день подлежит проверке.
   *
   * Проверяются только отметки сканом. Прогул, выходной и уважительная
   * причина звонков не предполагают, а правку руководителя система
   * не пересматривает — он решил за этот день сам.
   */
  private statusByArrival(record: AttendanceDoc): 'ON_TIME' | 'LATE' | null {
    if (record.adjustedBy !== null || record.method !== 'QR') return null;

    if (record.status === 'ON_TIME' || record.status === 'LATE') return record.status;
    if (record.status === 'NOT_COUNTED') return record.callCheck?.statusBefore ?? null;
    return null;
  }

  /** Правило — для менеджеров по продажам: у РОПа своих обзвонов нет. */
  private async managers(organizationId: string): Promise<Set<string>> {
    const snapshot = await this.db
      .collection(COLLECTIONS.users)
      .where('organizationId', '==', organizationId)
      .where('role', '==', 'MOP')
      .get();

    return new Set(snapshot.docs.map((doc) => doc.id));
  }

  /**
   * Исходящие за день и сколько из них закончились разговором.
   *
   * Входящие не считаются: на них менеджер почти всегда отвечает,
   * и они только завышали бы долю.
   */
  private async countCalls(
    userId: string,
    workDate: string,
  ): Promise<{ outbound: number; answered: number }> {
    const snapshot = await this.db
      .collection(COLLECTIONS.calls)
      .where('userId', '==', userId)
      .where('callDate', '==', workDate)
      .get();

    let outbound = 0;
    let answered = 0;

    for (const doc of snapshot.docs) {
      const call = doc.data() as CallDoc;
      if (call.direction !== 'OUTBOUND') continue;

      outbound += 1;
      if (call.status === 'ANSWERED') answered += 1;
    }

    return { outbound, answered };
  }

  private async notifyFailed(
    organizationId: string,
    userId: string,
    workDate: string,
    check: CallCheck,
  ): Promise<void> {
    const [, month, day] = workDate.split('-');
    const percent = Math.floor(check.rateBps / 100);
    const threshold = MIN_DAILY_CALL_RATE_BPS / 100;

    const body =
      check.outbound === 0
        ? `${day}.${month} не было ни одного исходящего звонка.`
        : `${day}.${month} дозвоны ${percent}% (${check.answered} из ${check.outbound}) — меньше ${threshold}%.`;

    await this.notifications.notifyUser(userId, {
      organizationId,
      kind: 'day_not_counted',
      body,
      refType: 'Attendance',
      refId: workDate,
    });
  }

  /**
   * Ночной прогон. Час после простановки прогулов: к этому времени
   * ежечасная выгрузка из Bitrix24 дотянула звонки за вчера.
   */
  @Cron('0 4 * * *')
  async runNightly(): Promise<void> {
    const results = await this.checkYesterdayEverywhere();
    const notCounted = results.reduce((total, item) => total + item.notCounted, 0);

    this.logger.log(
      `Дозвоны проверены: не засчитано ${notCounted} дней в ${results.length} организациях`,
    );
  }

  /** Прогон по всем организациям за их собственное «вчера». */
  async checkYesterdayEverywhere(now = new Date()): Promise<CallRateRunResult[]> {
    const organizations = await this.db.collection(COLLECTIONS.organizations).get();
    const results: CallRateRunResult[] = [];

    for (const doc of organizations.docs) {
      const timezone = (doc.data() as OrganizationDoc).timezone ?? 'Asia/Almaty';
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const workDate = localWorkDateKey(yesterday, timezone);

      try {
        const result = await this.locks.run(
          'call-rate',
          `${doc.id}_${workDate}`,
          async () => {
            const run = await this.checkForOrganization(doc.id, workDate);
            return { ...run, count: run.notCounted };
          },
        );

        if (!result) {
          this.logger.log(
            `Дозвоны за ${workDate} в организации ${doc.id} уже проверяет другой экземпляр`,
          );
          continue;
        }

        results.push(result);
      } catch (cause) {
        this.logger.error(
          `Дозвоны за ${workDate} не проверены в организации ${doc.id}: ${String(cause)}`,
        );
      }
    }

    return results;
  }

  /** Одна запись в журнал на прогон — как и у прогулов. */
  private async audit(
    organizationId: string,
    workDate: string,
    userIds: string[],
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId,
      actorId: null,
      action: 'attendance.day_not_counted',
      targetType: 'Attendance',
      targetId: workDate,
      metadata: { workDate, userIds, count: userIds.length },
      ip: null,
      createdAt: Timestamp.now(),
    });
  }
}
