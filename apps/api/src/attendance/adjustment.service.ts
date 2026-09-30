import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';
import { COLLECTIONS, attendanceDocId } from '../firestore/collections';
import type {
  AttendanceDoc,
  AttendanceStatus,
  OrganizationDoc,
  UserDoc,
} from '../firestore/types';
import {
  localIsoWeekday,
  localMinutesOfDay,
  parseHhMm,
} from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { AdjustAttendanceDto } from './dto';

/**
 * Ручная правка табеля.
 *
 * Это обход всего механизма контроля: руководитель может проставить приход
 * тому, кто не приходил. Поэтому правка не бывает тихой — обязательна
 * причина, запись помечается как ручная, а в журнал аудита уходит кто,
 * кому и почему изменил. В отчётах такие дни видно отдельно.
 */
@Injectable()
export class AttendanceAdjustmentService {
  private readonly logger = new Logger(AttendanceAdjustmentService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  async adjust(
    actor: AuthenticatedUser,
    userId: string,
    dto: AdjustAttendanceDto,
  ): Promise<{ id: string; status: AttendanceStatus; lateMinutes: number }> {
    const user = await this.loadManageable(actor, userId);

    if (actor.id === userId) {
      // Иначе руководитель правил бы собственные опоздания.
      throw new ForbiddenException('Нельзя править собственный табель');
    }

    const timezone = await this.timezoneOf(user.organizationId);
    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : null;

    if (checkInAt && Number.isNaN(checkInAt.getTime())) {
      throw new BadRequestException('Некорректное время прихода');
    }

    const { status, lateMinutes } = await this.evaluate(
      userId,
      user.departmentId,
      dto.status,
      checkInAt,
      timezone,
    );

    const docId = attendanceDocId(userId, dto.workDate);
    const ref = this.db.collection(COLLECTIONS.attendance).doc(docId);
    const existing = await ref.get();

    const now = Timestamp.now();
    const record: AttendanceDoc = {
      userId,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      officeId: user.officeId,
      terminalId: null,
      workDate: dto.workDate,
      checkInAt: checkInAt ? Timestamp.fromDate(checkInAt) : null,
      checkOutAt: (existing.data() as AttendanceDoc | undefined)?.checkOutAt ?? null,
      status,
      lateMinutes,
      // Помечаем источник: в отчётах ручные дни должны отличаться
      // от подтверждённых сканированием.
      method: 'MANUAL_ADJUSTMENT',
      lat: null,
      lng: null,
      accuracyMeters: null,
      distanceMeters: null,
      wifiBssid: null,
      isMocked: false,
      adjustedBy: actor.id,
      adjustNote: dto.reason,
      createdAt: (existing.data() as AttendanceDoc | undefined)?.createdAt ?? now,
    };

    await ref.set(record);

    await this.db.collection(COLLECTIONS.auditEvents).doc().set({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'attendance.adjust',
      targetType: 'Attendance',
      targetId: docId,
      metadata: {
        userId,
        workDate: dto.workDate,
        status,
        reason: dto.reason,
        previousStatus: (existing.data() as AttendanceDoc | undefined)?.status ?? null,
      },
      ip: null,
      createdAt: now,
    });

    this.logger.log(
      `${actor.email} изменил табель сотрудника ${userId} за ${dto.workDate}: ${status} (${dto.reason})`,
    );

    return { id: docId, status, lateMinutes };
  }

  /**
   * Опоздание пересчитывается по графику, а не берётся на слово.
   * Иначе руководитель проставлял бы «вовремя» при любом времени прихода.
   */
  private async evaluate(
    userId: string,
    departmentId: string | null,
    requestedStatus: AttendanceStatus | undefined,
    checkInAt: Date | null,
    timezone: string,
  ): Promise<{ status: AttendanceStatus; lateMinutes: number }> {
    if (!checkInAt) {
      return { status: requestedStatus ?? 'ABSENT', lateMinutes: 0 };
    }

    // Выходной и уважительная причина проставляются явно и опозданий не дают.
    if (requestedStatus === 'DAY_OFF' || requestedStatus === 'EXCUSED') {
      return { status: requestedStatus, lateMinutes: 0 };
    }

    const schedule = await this.findSchedule(userId, departmentId, checkInAt);
    if (!schedule) return { status: 'ON_TIME', lateMinutes: 0 };

    const weekday = localIsoWeekday(checkInAt, timezone);
    if (!schedule.workdays.includes(weekday)) {
      return { status: 'DAY_OFF', lateMinutes: 0 };
    }

    const arrival = localMinutesOfDay(checkInAt, timezone);
    const start = parseHhMm(schedule.startTime);
    const lateMinutes = Math.max(0, arrival - (start + schedule.graceMinutes));

    return { status: lateMinutes > 0 ? 'LATE' : 'ON_TIME', lateMinutes };
  }

  private async findSchedule(
    userId: string,
    departmentId: string | null,
    at: Date,
  ): Promise<{ startTime: string; graceMinutes: number; workdays: number[] } | null> {
    const collection = this.db.collection(COLLECTIONS.workSchedules);

    const personal = await collection
      .where('userId', '==', userId)
      .where('effectiveFrom', '<=', Timestamp.fromDate(at))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();

    if (!personal.empty) {
      return personal.docs[0].data() as never;
    }

    if (!departmentId) return null;

    const departmental = await collection
      .where('departmentId', '==', departmentId)
      .where('effectiveFrom', '<=', Timestamp.fromDate(at))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();

    return departmental.empty ? null : (departmental.docs[0].data() as never);
  }

  private async loadManageable(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<UserDoc> {
    const snapshot = await this.db.collection(COLLECTIONS.users).doc(userId).get();
    const user = snapshot.data() as UserDoc | undefined;

    if (!snapshot.exists || user?.organizationId !== actor.organizationId) {
      throw new NotFoundException('Сотрудник не найден');
    }

    // РОП правит табель только своего отдела.
    if (actor.role === 'ROP' && user.departmentId !== actor.departmentId) {
      throw new ForbiddenException('Сотрудник не из вашего отдела');
    }

    return user;
  }

  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }
}
