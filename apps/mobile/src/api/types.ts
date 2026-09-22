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
}
