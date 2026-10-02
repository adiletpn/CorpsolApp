import type { Permission, Role } from '@corpsol/shared';

/** Профиль вошедшего пользователя вместе с полным списком его прав. */
export interface Session {
  id: string;
  email: string;
  role: Role;
  departmentId: string | null;
  officeId: string | null;
  permissions: Permission[];
}

export interface Employee {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  departmentId: string | null;
  officeId: string | null;
  phone: string | null;
  baseSalaryMinor: number;
  hiredAt: string;
  terminatedAt: string | null;
}

export interface Department {
  id: string;
  name: string;
  head: { id: string; fullName: string } | null;
  memberCount: number;
}

export interface Office {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  wifiBssids: string[];
}

export interface Terminal {
  id: string;
  officeId: string;
  name: string;
  isActive: boolean;
  hasAccessToken: boolean;
  tokenIssuedAt: string | null;
  createdAt: string;
}

export interface DeviceRequest {
  id: string;
  userId: string;
  deviceId: string;
  platform: string;
  model?: string;
  createdAt: { _seconds: number } | string;
  user: { id: string; fullName: string; email: string; role: Role };
}

export interface AttendanceRates {
  presentDays: number;
  expectedDays: number;
  attendanceRate: number;
  punctualityRate: number;
  averageLateMinutes: number;
}

export interface RiskFlag {
  code: 'FREQUENT_LATE' | 'ABSENTEEISM' | 'PLAN_BEHIND';
  severity: 'warning' | 'critical';
  message: string;
}

export interface EmployeeStats {
  userId: string;
  fullName: string;
  rates: AttendanceRates;
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

export interface PlanProgress {
  metric: 'CALLS' | 'TALK_MINUTES' | 'OFFERS' | 'REVENUE';
  target: number;
  achieved: number;
  ratio: number;
  remaining: number;
  isComplete: boolean;
}

export interface Plan {
  id: string;
  scope: 'DEPARTMENT' | 'USER';
  ownerId: string;
  metric: PlanProgress['metric'];
  periodStart: string;
  periodEnd: string;
  progress: PlanProgress;
}

export interface Offer {
  id: string;
  userId: string;
  clientName: string;
  clientPhone: string | null;
  amountMinor: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  sentDate: string;
  sentAt: string;
  resolvedAt: string | null;
}

export interface PayrollLine {
  ruleId: string;
  kind: string;
  title: string;
  amountMinor: number;
}

export interface Payroll {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  baseSalaryMinor: number;
  bonusMinor: number;
  penaltyMinor: number;
  totalMinor: number;
  lines: PayrollLine[];
  status: 'DRAFT' | 'APPROVED' | 'PAID';
}

export interface BonusRule {
  id: string;
  kind: 'PLAN_COMPLETION' | 'PER_UNIT' | 'ATTENDANCE' | 'LATE_PENALTY' | 'ABSENCE_PENALTY';
  metric: PlanProgress['metric'] | null;
  departmentId: string | null;
  threshold: number;
  amountMinor: number;
  percentBps: number;
  isActive: boolean;
}

export interface RankedEntry {
  userId: string;
  fullName: string;
  points: number;
  rank: number;
  pointsBehindLeader: number;
  breakdown?: Record<string, number>;
}

export interface Schedule {
  id: string;
  departmentId: string | null;
  userId: string | null;
  /** Имя отдела или сотрудника, которому принадлежит график. */
  ownerName: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  /** Дни недели: 1 — понедельник … 7 — воскресенье. */
  workdays: number[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: { id: string; fullName: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface LeaderboardResult {
  departmentId: string | null;
  periodStart: string;
  periodEnd: string;
  entries: RankedEntry[];
  self: RankedEntry | null;
}

export interface Call {
  id: string;
  userId: string;
  source: 'KCELL' | 'BITRIX';
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';
  clientPhone: string;
  callDate: string;
  startedAt: string;
  durationSeconds: number;
  /** Время разговора без ожидания ответа — по нему считают нагрузку. */
  talkSeconds: number;
  recordingUrl: string | null;
}

export interface CallSummary {
  total: number;
  answered: number;
  talkMinutes: number;
}

export interface WorkNumberLink {
  id: string;
  userId: string;
  fullName: string;
  provider: 'KCELL' | 'BITRIX';
  workNumber: string;
}
