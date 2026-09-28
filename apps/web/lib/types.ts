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
