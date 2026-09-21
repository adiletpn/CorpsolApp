export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'MOP' | 'ROP' | 'HR' | 'DIRECTOR' | 'SUPER_ADMIN';
  departmentId: string | null;
  officeId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
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
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: CheckInResponse['status'];
  lateMinutes: number;
}
