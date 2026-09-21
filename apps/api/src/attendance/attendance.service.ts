import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  CheckMethod,
  PointsReason,
  Prisma,
  UserStatus,
  type WorkSchedule,
} from '@prisma/client';
import {
  CHECK_IN_REJECTION_MESSAGES,
  checkGeofence,
  parseQrPayload,
  type CheckInRejection,
} from '@corpsol/shared';

import { PrismaService } from '../prisma/prisma.service';
import {
  localIsoWeekday,
  localMinutesOfDay,
  localWorkDate,
  parseHhMm,
} from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TerminalService } from './terminal.service';
import type { CheckInDto } from './dto';

/** Насколько раньше начала смены разрешено отмечаться. */
const EARLY_CHECK_IN_WINDOW_MINUTES = 120;

const POINTS_ON_TIME = 10;
const POINTS_LATE = -5;

class CheckInRejected extends BadRequestException {
  constructor(code: CheckInRejection, details?: Record<string, unknown>) {
    super({ code, message: CHECK_IN_REJECTION_MESSAGES[code], ...details });
  }
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminals: TerminalService,
  ) {}

  /**
   * Отметка прихода. Засчитывается только при одновременном совпадении
   * четырёх факторов: привязанное устройство, живой код терминала,
   * координаты внутри геозоны и (если настроено) офисный Wi-Fi.
   */
  async checkIn(actor: AuthenticatedUser, dto: CheckInDto) {
    // Фактор 1 — устройство. Токен несёт id привязки; для МОПа он обязателен.
    if (!actor.deviceId) {
      throw new CheckInRejected('device_not_bound');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: { organization: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new CheckInRejected('employee_inactive');
    }

    // Фактор 2 — код терминала, живущий 30 секунд.
    const payload = parseQrPayload(dto.qr);
    if (!payload) throw new CheckInRejected('qr_invalid');

    const verdict = await this.terminals.verify(payload);
    if (verdict.expired) throw new CheckInRejected('qr_expired');
    if (!verdict.valid) throw new CheckInRejected('qr_invalid');

    const terminal = await this.prisma.terminal.findUniqueOrThrow({
      where: { id: verdict.terminalId },
      include: { office: true },
    });
    const office = terminal.office;

    // Фактор 3 — геозона. Погрешность трактуется не в пользу сотрудника.
    const geo = checkGeofence(
      {
        lat: dto.lat,
        lng: dto.lng,
        accuracyMeters: dto.accuracyMeters,
        isMocked: dto.isMocked,
      },
      { lat: office.lat, lng: office.lng, radiusMeters: office.radiusMeters },
      { maxAccuracyMeters: office.maxAccuracyMeters },
    );
    if (!geo.inside) {
      throw new CheckInRejected(geo.reason ?? 'outside_fence', {
        distanceMeters: Math.round(geo.distanceMeters),
        radiusMeters: office.radiusMeters,
      });
    }

    // Фактор 4 — офисный Wi-Fi. Включается только если для офиса заданы BSSID.
    if (office.wifiBssids.length > 0) {
      const bssid = dto.wifiBssid?.toLowerCase();
      if (!bssid || !office.wifiBssids.map((item) => item.toLowerCase()).includes(bssid)) {
        throw new CheckInRejected('outside_fence', { reasonDetail: 'wifi_mismatch' });
      }
    }

    const timezone = user.organization.timezone;
    const now = new Date();
    const workDate = localWorkDate(now, timezone);

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_workDate: { userId: user.id, workDate } },
    });
    if (existing?.checkInAt) {
      throw new CheckInRejected('already_checked_in');
    }

    const schedule = await this.resolveSchedule(user.id, user.departmentId, now);
    const { status, lateMinutes } = this.evaluateArrival(now, timezone, schedule);

    const data: Prisma.AttendanceUncheckedCreateInput = {
      userId: user.id,
      officeId: office.id,
      terminalId: terminal.id,
      workDate,
      checkInAt: now,
      status,
      lateMinutes,
      method: CheckMethod.QR,
      lat: dto.lat,
      lng: dto.lng,
      accuracyMeters: dto.accuracyMeters,
      distanceMeters: geo.distanceMeters,
      wifiBssid: dto.wifiBssid,
      isMocked: Boolean(dto.isMocked),
    };

    const attendance = await this.prisma.attendance.upsert({
      where: { userId_workDate: { userId: user.id, workDate } },
      create: data,
      update: data,
    });

    await this.awardCheckInPoints(user.id, attendance.id, status);

    return {
      id: attendance.id,
      status: attendance.status,
      lateMinutes: attendance.lateMinutes,
      checkInAt: attendance.checkInAt,
      office: { id: office.id, name: office.name },
      distanceMeters: Math.round(geo.distanceMeters),
    };
  }

  async checkOut(actor: AuthenticatedUser, capturedAt: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: { organization: true },
    });
    const workDate = localWorkDate(new Date(), user.organization.timezone);

    const attendance = await this.prisma.attendance.findUnique({
      where: { userId_workDate: { userId: user.id, workDate } },
    });
    if (!attendance?.checkInAt) {
      throw new BadRequestException('Приход на сегодня не отмечен');
    }

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOutAt: new Date(capturedAt) },
    });
  }

  /** Личный табель сотрудника за период. */
  async listForUser(userId: string, from: Date, to: Date) {
    return this.prisma.attendance.findMany({
      where: { userId, workDate: { gte: from, lte: to } },
      orderBy: { workDate: 'desc' },
    });
  }

  /**
   * Табель с учётом области видимости роли: РОП видит свой отдел,
   * директор и HR — всю компанию, МОП — только себя.
   */
  async listScoped(actor: AuthenticatedUser, from: Date, to: Date, departmentId?: string) {
    const where: Prisma.AttendanceWhereInput = { workDate: { gte: from, lte: to } };

    if (actor.role === 'MOP') {
      where.userId = actor.id;
    } else if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      where.user = { departmentId: actor.departmentId };
    } else {
      where.user = { organizationId: actor.organizationId, ...(departmentId ? { departmentId } : {}) };
    }

    return this.prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, departmentId: true } },
        office: { select: { id: true, name: true } },
      },
      orderBy: [{ workDate: 'desc' }, { checkInAt: 'asc' }],
    });
  }

  /** Личный график имеет приоритет над отдельским. */
  private async resolveSchedule(
    userId: string,
    departmentId: string | null,
    at: Date,
  ): Promise<WorkSchedule | null> {
    const effective: Prisma.WorkScheduleWhereInput = {
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    };

    const personal = await this.prisma.workSchedule.findFirst({
      where: { userId, ...effective },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (personal) return personal;

    if (!departmentId) return null;
    return this.prisma.workSchedule.findFirst({
      where: { departmentId, ...effective },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  private evaluateArrival(
    now: Date,
    timezone: string,
    schedule: WorkSchedule | null,
  ): { status: AttendanceStatus; lateMinutes: number } {
    // Без заданного графика фиксируем факт прихода, но не судим об опоздании.
    if (!schedule) return { status: AttendanceStatus.ON_TIME, lateMinutes: 0 };

    const weekday = localIsoWeekday(now, timezone);
    if (!schedule.workdays.includes(weekday)) {
      return { status: AttendanceStatus.DAY_OFF, lateMinutes: 0 };
    }

    const arrival = localMinutesOfDay(now, timezone);
    const start = parseHhMm(schedule.startTime);
    const end = parseHhMm(schedule.endTime);

    if (arrival < start - EARLY_CHECK_IN_WINDOW_MINUTES || arrival > end) {
      throw new CheckInRejected('outside_schedule');
    }

    const lateMinutes = Math.max(0, arrival - (start + schedule.graceMinutes));
    return {
      status: lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      lateMinutes,
    };
  }

  /** Начисление за приход. Уникальный индекс по (reason, ref) не даёт начислить дважды. */
  private async awardCheckInPoints(
    userId: string,
    attendanceId: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (status !== AttendanceStatus.ON_TIME && status !== AttendanceStatus.LATE) return;

    const onTime = status === AttendanceStatus.ON_TIME;
    await this.prisma.pointsEntry.upsert({
      where: {
        userId_reason_refType_refId: {
          userId,
          reason: onTime ? PointsReason.CHECK_IN_ON_TIME : PointsReason.LATE_PENALTY,
          refType: 'Attendance',
          refId: attendanceId,
        },
      },
      create: {
        userId,
        reason: onTime ? PointsReason.CHECK_IN_ON_TIME : PointsReason.LATE_PENALTY,
        points: onTime ? POINTS_ON_TIME : POINTS_LATE,
        refType: 'Attendance',
        refId: attendanceId,
      },
      update: {},
    });
  }
}
