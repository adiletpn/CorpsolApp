export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'MOP' | 'ROP' | 'HR' | 'DIRECTOR' | 'SUPER_ADMIN';
  departmentId: string | null;
  officeId: string | null;
  /** Телефон, за которым закреплён аккаунт. */
  boundDeviceId: string | null;
}

export interface CheckInResponse {
  id: string;
  status: 'ON_TIME' | 'LATE' | 'ABSENT' | 'DAY_OFF' | 'EXCUSED';
  lateMinutes: number;
  checkInAt: string;
  office: { id: string; name: string };
  distanceMeters: number;
}

export interface AttendanceRecord {
  id: string;
  /** Календарная дата смены «ГГГГ-ММ-ДД». */
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: CheckInResponse['status'];
  lateMinutes: number;
  /** Как появилась отметка: скан QR либо ручная правка руководителем. */
  method: 'QR_SCAN' | 'MANUAL_ADJUSTMENT';
}

export interface PayrollLine {
  ruleId: string;
  kind: string;
  title: string;
  amountMinor: number;
}

export interface Payroll {
  id: string;
  periodStart: string;
  periodEnd: string;
  baseSalaryMinor: number;
  bonusMinor: number;
  penaltyMinor: number;
  totalMinor: number;
  lines: PayrollLine[];
  status: 'DRAFT' | 'APPROVED' | 'PAID';
}

export interface Offer {
  id: string;
  clientName: string;
  clientPhone: string | null;
  amountMinor: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  sentDate: string;
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
  metric: PlanProgress['metric'];
  progress: PlanProgress;
}

export interface RankedEntry {
  userId: string;
  fullName: string;
  points: number;
  rank: number;
  pointsBehindLeader: number;
}

export interface LeaderboardResult {
  entries: RankedEntry[];
  self: RankedEntry | null;
}

export interface CallsSummary {
  total: number;
  answered: number;
  talkMinutes: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  points: number;
  /** Дата получения, либо null — тогда это цель, а не достижение. */
  unlockedAt: string | null;
}
