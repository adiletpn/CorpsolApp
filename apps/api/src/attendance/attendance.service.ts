import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CHECK_IN_REJECTION_MESSAGES,
  checkGeofence,
  matchesKnownBssid,
  parseQrPayload,
  type CheckInRejection,
} from '@corpsol/shared';

import { FirebaseService } from '../firebase/firebase.service';
import {
  COLLECTIONS,
  attendanceDocId,
  pointsDocId,
} from '../firestore/collections';
import type {
  AttendanceDoc,
  AttendanceStatus,
  OfficeDoc,
  OrganizationDoc,
  PointsDoc,
  TerminalDoc,
  UserDoc,
  WorkScheduleDoc,
} from '../firestore/types';
import {
  localIsoWeekday,
  localMinutesOfDay,
  localWorkDateKey,
  parseHhMm,
} from '../common/utils/time';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TerminalService } from './terminal.service';
import type { CheckInDto } from './dto';

/** Насколько раньше начала смены разрешено отмечаться. */
const EARLY_CHECK_IN_WINDOW_MINUTES = 120;

const POINTS_ON_TIME = 10;
const POINTS_LATE = -5;

/** Код Firestore для попытки создать уже существующий документ. */
const ALREADY_EXISTS = 6;

class CheckInRejected extends BadRequestException {
  constructor(code: CheckInRejection, details?: Record<string, unknown>) {
    super({ code, message: CHECK_IN_REJECTION_MESSAGES[code], ...details });
  }
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly terminals: TerminalService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /**
   * Отметка прихода. Засчитывается только при одновременном совпадении
   * четырёх факторов: привязанное устройство, живой код терминала,
   * координаты внутри геозоны и (если настроено) офисный Wi-Fi.
   */
  async checkIn(actor: AuthenticatedUser, dto: CheckInDto) {
    // Фактор 1 — устройство. Гвард уже сверил привязку, здесь проверяется,
    // что телефон вообще был предъявлен.
    if (!actor.deviceId) {
      throw new CheckInRejected('device_not_bound');
    }

    const userSnapshot = await this.db.collection(COLLECTIONS.users).doc(actor.id).get();
    const user = userSnapshot.data() as UserDoc | undefined;
    if (!user || user.status !== 'ACTIVE') {
      throw new CheckInRejected('employee_inactive');
    }

    // Фактор 2 — код терминала, живущий 30 секунд.
    const payload = parseQrPayload(dto.qr);
    if (!payload) throw new CheckInRejected('qr_invalid');

    const verdict = await this.terminals.verify(payload);
    if (verdict.expired) throw new CheckInRejected('qr_expired');
    if (!verdict.valid) throw new CheckInRejected('qr_invalid');

    const terminalSnapshot = await this.db
      .collection(COLLECTIONS.terminals)
      .doc(verdict.terminalId)
      .get();
    const terminal = terminalSnapshot.data() as TerminalDoc;

    const officeSnapshot = await this.db
      .collection(COLLECTIONS.offices)
      .doc(terminal.officeId)
      .get();
    const office = officeSnapshot.data() as OfficeDoc;

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

    // Фактор 4 — офисный Wi-Fi. Включается, только если для офиса заданы BSSID.
    // Сравнение идёт через нормализацию: разделители и регистр у роутера
    // и у телефона различаются, и посимвольное сравнение не совпало бы никогда.
    if (office.wifiBssids.length > 0) {
      if (!matchesKnownBssid(dto.wifiBssid, office.wifiBssids)) {
        throw new CheckInRejected('outside_fence', { reasonDetail: 'wifi_mismatch' });
      }
    }

    const timezone = await this.timezoneOf(user.organizationId);
    const now = new Date();
    const workDate = localWorkDateKey(now, timezone);

    const schedule = await this.resolveSchedule(actor.id, user.departmentId, now);
    const { status, lateMinutes } = this.evaluateArrival(now, timezone, schedule);

    const record: AttendanceDoc = {
      userId: actor.id,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      officeId: terminal.officeId,
      terminalId: verdict.terminalId,
      workDate,
      checkInAt: Timestamp.fromDate(now),
      checkOutAt: null,
      status,
      lateMinutes,
      method: 'QR',
      lat: dto.lat,
      lng: dto.lng,
      accuracyMeters: dto.accuracyMeters,
      distanceMeters: geo.distanceMeters,
      wifiBssid: dto.wifiBssid ?? null,
      isMocked: Boolean(dto.isMocked),
      adjustedBy: null,
      adjustNote: null,
      createdAt: Timestamp.fromDate(now),
    };

    const docId = attendanceDocId(actor.id, workDate);

    try {
      // create вместо set: ключ документа содержит дату смены, поэтому
      // повторный скан за тот же день отвергает сама база.
      await this.db.collection(COLLECTIONS.attendance).doc(docId).create(record);
    } catch (cause) {
      if ((cause as { code?: number }).code === ALREADY_EXISTS) {
        throw new CheckInRejected('already_checked_in');
      }
      throw cause;
    }

    await this.awardCheckInPoints(actor.id, docId, status);

    return {
      id: docId,
      status,
      lateMinutes,
      checkInAt: now.toISOString(),
      office: { id: terminal.officeId, name: office.name },
      distanceMeters: Math.round(geo.distanceMeters),
    };
  }

  async checkOut(actor: AuthenticatedUser, capturedAt: string) {
    const user = (
      await this.db.collection(COLLECTIONS.users).doc(actor.id).get()
    ).data() as UserDoc;

    const timezone = await this.timezoneOf(user.organizationId);
    const workDate = localWorkDateKey(new Date(), timezone);
    const ref = this.db.collection(COLLECTIONS.attendance).doc(attendanceDocId(actor.id, workDate));

    const snapshot = await ref.get();
    if (!snapshot.exists || !(snapshot.data() as AttendanceDoc).checkInAt) {
      throw new BadRequestException('Приход на сегодня не отмечен');
    }

    await ref.update({ checkOutAt: Timestamp.fromDate(new Date(capturedAt)) });
    return { id: ref.id, checkOutAt: capturedAt };
  }

  /**
   * Приводит документ к виду, пригодному для клиента: Timestamp иначе уезжает
   * в JSON как {_seconds, _nanoseconds}, и разбирать это пришлось бы каждому
   * клиенту отдельно.
   */
  private toResponse(id: string, doc: AttendanceDoc) {
    return {
      id,
      userId: doc.userId,
      departmentId: doc.departmentId,
      officeId: doc.officeId,
      workDate: doc.workDate,
      checkInAt: doc.checkInAt?.toDate().toISOString() ?? null,
      checkOutAt: doc.checkOutAt?.toDate().toISOString() ?? null,
      status: doc.status,
      lateMinutes: doc.lateMinutes,
      method: doc.method,
      distanceMeters: doc.distanceMeters,
      isMocked: doc.isMocked,
    };
  }

  /** Личный табель сотрудника за период. */
  async listForUser(userId: string, from: string, to: string) {
    const snapshot = await this.db
      .collection(COLLECTIONS.attendance)
      .where('userId', '==', userId)
      .where('workDate', '>=', from)
      .where('workDate', '<=', to)
      .orderBy('workDate', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.toResponse(doc.id, doc.data() as AttendanceDoc));
  }

  /**
   * Табель с учётом области видимости роли: РОП видит свой отдел,
   * директор и HR — всю компанию, МОП — только себя.
   */
  async listScoped(actor: AuthenticatedUser, from: string, to: string, departmentId?: string) {
    let query = this.db
      .collection(COLLECTIONS.attendance)
      .where('workDate', '>=', from)
      .where('workDate', '<=', to);

    if (actor.role === 'MOP') {
      query = query.where('userId', '==', actor.id);
    } else if (actor.role === 'ROP') {
      if (!actor.departmentId) throw new ForbiddenException('РОП не привязан к отделу');
      query = query.where('departmentId', '==', actor.departmentId);
    } else {
      query = query.where('organizationId', '==', actor.organizationId);
      if (departmentId) query = query.where('departmentId', '==', departmentId);
    }

    const snapshot = await query.orderBy('workDate', 'desc').get();
    return snapshot.docs.map((doc) => this.toResponse(doc.id, doc.data() as AttendanceDoc));
  }

  private async timezoneOf(organizationId: string): Promise<string> {
    const snapshot = await this.db
      .collection(COLLECTIONS.organizations)
      .doc(organizationId)
      .get();

    return (snapshot.data() as OrganizationDoc | undefined)?.timezone ?? 'Asia/Almaty';
  }

  /** Личный график имеет приоритет над отдельским. */
  private async resolveSchedule(
    userId: string,
    departmentId: string | null,
    at: Date,
  ): Promise<WorkScheduleDoc | null> {
    const personal = await this.db
      .collection(COLLECTIONS.workSchedules)
      .where('userId', '==', userId)
      .where('effectiveFrom', '<=', Timestamp.fromDate(at))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();

    const active = (doc: WorkScheduleDoc): boolean =>
      doc.effectiveTo === null || doc.effectiveTo.toDate() >= at;

    if (!personal.empty) {
      const doc = personal.docs[0].data() as WorkScheduleDoc;
      if (active(doc)) return doc;
    }

    if (!departmentId) return null;

    const departmental = await this.db
      .collection(COLLECTIONS.workSchedules)
      .where('departmentId', '==', departmentId)
      .where('effectiveFrom', '<=', Timestamp.fromDate(at))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();

    if (departmental.empty) return null;
    const doc = departmental.docs[0].data() as WorkScheduleDoc;
    return active(doc) ? doc : null;
  }

  private evaluateArrival(
    now: Date,
    timezone: string,
    schedule: WorkScheduleDoc | null,
  ): { status: AttendanceStatus; lateMinutes: number } {
    // Без заданного графика фиксируем факт прихода, но не судим об опоздании.
    if (!schedule) return { status: 'ON_TIME', lateMinutes: 0 };

    const weekday = localIsoWeekday(now, timezone);
    if (!schedule.workdays.includes(weekday)) {
      return { status: 'DAY_OFF', lateMinutes: 0 };
    }

    const arrival = localMinutesOfDay(now, timezone);
    const start = parseHhMm(schedule.startTime);
    const end = parseHhMm(schedule.endTime);

    if (arrival < start - EARLY_CHECK_IN_WINDOW_MINUTES || arrival > end) {
      throw new CheckInRejected('outside_schedule');
    }

    const lateMinutes = Math.max(0, arrival - (start + schedule.graceMinutes));
    return { status: lateMinutes > 0 ? 'LATE' : 'ON_TIME', lateMinutes };
  }

  /**
   * Начисление за приход. Ключ документа содержит причину и саму отметку,
   * поэтому повторная обработка того же события не начислит очки дважды.
   */
  private async awardCheckInPoints(
    userId: string,
    attendanceId: string,
    status: AttendanceStatus,
  ): Promise<void> {
    if (status !== 'ON_TIME' && status !== 'LATE') return;

    const onTime = status === 'ON_TIME';
    const reason = onTime ? 'CHECK_IN_ON_TIME' : 'LATE_PENALTY';

    const entry: PointsDoc = {
      userId,
      reason,
      points: onTime ? POINTS_ON_TIME : POINTS_LATE,
      refType: 'Attendance',
      refId: attendanceId,
      comment: null,
      createdAt: Timestamp.now(),
    };

    await this.db
      .collection(COLLECTIONS.points)
      .doc(pointsDocId(userId, reason, 'Attendance', attendanceId))
      .set(entry, { merge: false });
  }
}
