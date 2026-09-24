import type { Timestamp } from 'firebase-admin/firestore';
import type { Role } from '@corpsol/shared';

/**
 * Формы документов Firestore. Коллекции нетипизированы по своей природе,
 * поэтому единственное описание схемы живёт здесь, а сервисы читают
 * данные только через эти типы.
 *
 * Даты хранятся как Timestamp, кроме календарных дат смены и периодов —
 * те лежат строками «ГГГГ-ММ-ДД», потому что участвуют в ключах документов
 * и в сортировке диапазонов.
 */

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface UserDoc {
  /** Совпадает с UID в Firebase Auth. */
  organizationId: string;
  email: string;
  phone?: string;
  fullName: string;
  role: Role;
  status: UserStatus;

  departmentId: string | null;
  officeId: string | null;

  hiredAt: Timestamp;
  terminatedAt: Timestamp | null;

  /** Оклад в тиынах — целые числа, без потерь на округлении. */
  baseSalaryMinor: number;
  currency: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OfficeDoc {
  organizationId: string;
  name: string;
  address?: string;

  lat: number;
  lng: number;
  radiusMeters: number;
  /** Погрешность хуже этой считаем недостоверной. */
  maxAccuracyMeters: number;
  /** Пустой список отключает проверку по Wi-Fi для офиса. */
  wifiBssids: string[];
}

export interface TerminalDoc {
  officeId: string;
  name: string;
  /** Секрет HMAC для подписи QR. Не покидает сервер. */
  secret: string;
  isActive: boolean;
  /** Только хеш токена экрана: дамп базы не даёт рабочего токена. */
  accessTokenHash: string | null;
  tokenIssuedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface OrganizationDoc {
  name: string;
  timezone: string;
  createdAt: Timestamp;
}

export interface DepartmentDoc {
  organizationId: string;
  name: string;
  /** РОП отдела. */
  headId: string | null;
}

export interface DeviceDoc {
  /** ID документа — сам идентификатор телефона, отсюда уникальность привязки. */
  userId: string;
  platform: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;

  isActive: boolean;
  boundAt: Timestamp;
  lastSeenAt: Timestamp;
  revokedAt: Timestamp | null;
  revokedBy: string | null;
}

export type DeviceRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DeviceRequestDoc {
  userId: string;
  deviceId: string;
  platform: string;
  model?: string;

  status: DeviceRequestStatus;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  resolveNote: string | null;
}

export type AttendanceStatus = 'ON_TIME' | 'LATE' | 'ABSENT' | 'DAY_OFF' | 'EXCUSED';
export type CheckMethod = 'QR' | 'MANUAL_ADJUSTMENT';

export interface AttendanceDoc {
  userId: string;
  organizationId: string;
  departmentId: string | null;
  officeId: string | null;
  terminalId: string | null;

  /** Календарная дата смены «ГГГГ-ММ-ДД» в часовом поясе организации. */
  workDate: string;
  checkInAt: Timestamp | null;
  checkOutAt: Timestamp | null;

  status: AttendanceStatus;
  lateMinutes: number;
  method: CheckMethod;

  // Что сообщило устройство в момент отметки — доказательная база.
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  wifiBssid: string | null;
  isMocked: boolean;

  adjustedBy: string | null;
  adjustNote: string | null;
  createdAt: Timestamp;
}

export interface WorkScheduleDoc {
  departmentId: string | null;
  userId: string | null;

  /** Локальное время смены в формате «ЧЧ:мм». */
  startTime: string;
  endTime: string;
  /** Допуск на опоздание в минутах. */
  graceMinutes: number;
  /** Дни недели, 1 = понедельник … 7 = воскресенье. */
  workdays: number[];

  effectiveFrom: Timestamp;
  effectiveTo: Timestamp | null;
}

export type PointsReason =
  | 'CHECK_IN_ON_TIME'
  | 'CALL_QUOTA'
  | 'OFFER_ACCEPTED'
  | 'PLAN_COMPLETED'
  | 'STREAK_BONUS'
  | 'MANUAL_ADJUSTMENT'
  | 'LATE_PENALTY';

export interface PointsDoc {
  userId: string;
  reason: PointsReason;
  points: number;
  refType: string | null;
  refId: string | null;
  comment: string | null;
  createdAt: Timestamp;
}

export interface AuditEventDoc {
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Timestamp;
}

export interface PlanDoc {
  scope: 'DEPARTMENT' | 'USER';
  organizationId: string;
  /** Отдел или сотрудник — в зависимости от области плана. */
  ownerId: string;
  metric: 'CALLS' | 'TALK_MINUTES' | 'OFFERS' | 'REVENUE';
  /** Для REVENUE — сумма в тиынах, для остальных метрик штуки или минуты. */
  target: number;

  /** Границы периода, «ГГГГ-ММ-ДД». Строками, потому что входят в ключ. */
  periodStart: string;
  periodEnd: string;

  createdBy: string;
  createdAt: Timestamp;
}

export type CallSource = 'BITRIX' | 'KCELL' | 'MANUAL';

export interface CallDoc {
  userId: string;
  organizationId: string;
  departmentId: string | null;

  source: CallSource;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';
  clientPhone: string;

  startedAt: Timestamp;
  /** Календарная дата звонка «ГГГГ-ММ-ДД» — по ней идут выборки за период. */
  callDate: string;

  /** Полная длительность соединения, включая гудки. */
  durationSeconds: number;
  /** Чистое время разговора. План считается по нему, а не по гудкам. */
  talkSeconds: number;

  recordingUrl: string | null;
  importedAt: Timestamp;
}

export type OfferStatus = 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface OfferDoc {
  userId: string;
  organizationId: string;
  departmentId: string | null;

  clientName: string;
  clientPhone: string | null;
  /** Сумма оффера в тиынах. */
  amountMinor: number;
  status: OfferStatus;

  sentAt: Timestamp;
  /** Календарная дата отправки «ГГГГ-ММ-ДД». */
  sentDate: string;
  resolvedAt: Timestamp | null;
}
