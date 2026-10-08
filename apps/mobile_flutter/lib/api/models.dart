// Модели ответов бэкенда. Имена полей совпадают с JSON — расхождение
// между клиентом и сервером ловится здесь, а не на экране.

enum Role { mop, rop, hr, director, superAdmin }

Role roleFromJson(String value) => switch (value) {
      'ROP' => Role.rop,
      'HR' => Role.hr,
      'DIRECTOR' => Role.director,
      'SUPER_ADMIN' => Role.superAdmin,
      _ => Role.mop,
    };

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.departmentId,
    required this.officeId,
    required this.boundDeviceId,
  });

  final String id;
  final String email;
  final String fullName;
  final Role role;
  final String? departmentId;
  final String? officeId;

  /// Телефон, за которым закреплён аккаунт.
  final String? boundDeviceId;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        role: roleFromJson(json['role'] as String),
        departmentId: json['departmentId'] as String?,
        officeId: json['officeId'] as String?,
        boundDeviceId: json['boundDeviceId'] as String?,
      );
}

enum AttendanceStatus { onTime, late, absent, dayOff, excused }

AttendanceStatus attendanceStatusFromJson(String value) => switch (value) {
      'LATE' => AttendanceStatus.late,
      'ABSENT' => AttendanceStatus.absent,
      'DAY_OFF' => AttendanceStatus.dayOff,
      'EXCUSED' => AttendanceStatus.excused,
      _ => AttendanceStatus.onTime,
    };

class OfficeRef {
  const OfficeRef({required this.id, required this.name});

  final String id;
  final String name;

  factory OfficeRef.fromJson(Map<String, dynamic> json) =>
      OfficeRef(id: json['id'] as String, name: json['name'] as String);
}

class CheckInResponse {
  const CheckInResponse({
    required this.id,
    required this.status,
    required this.lateMinutes,
    required this.checkInAt,
    required this.office,
    required this.distanceMeters,
  });

  final String id;
  final AttendanceStatus status;
  final int lateMinutes;
  final DateTime checkInAt;
  final OfficeRef office;
  final double distanceMeters;

  factory CheckInResponse.fromJson(Map<String, dynamic> json) => CheckInResponse(
        id: json['id'] as String,
        status: attendanceStatusFromJson(json['status'] as String),
        lateMinutes: (json['lateMinutes'] as num).toInt(),
        checkInAt: DateTime.parse(json['checkInAt'] as String),
        office: OfficeRef.fromJson(json['office'] as Map<String, dynamic>),
        distanceMeters: (json['distanceMeters'] as num).toDouble(),
      );
}

/// Как появилась запись: скан QR, правка руководителем либо ночная задача.
enum AttendanceMethod { qr, manualAdjustment, autoAbsence }

AttendanceMethod attendanceMethodFromJson(String value) => switch (value) {
      'MANUAL_ADJUSTMENT' => AttendanceMethod.manualAdjustment,
      'AUTO_ABSENCE' => AttendanceMethod.autoAbsence,
      _ => AttendanceMethod.qr,
    };

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.workDate,
    required this.checkInAt,
    required this.checkOutAt,
    required this.status,
    required this.lateMinutes,
    required this.method,
  });

  final String id;

  /// Календарная дата смены «ГГГГ-ММ-ДД».
  final String workDate;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;
  final AttendanceStatus status;
  final int lateMinutes;
  final AttendanceMethod method;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        id: json['id'] as String,
        workDate: json['workDate'] as String,
        checkInAt: _parseOrNull(json['checkInAt']),
        checkOutAt: _parseOrNull(json['checkOutAt']),
        status: attendanceStatusFromJson(json['status'] as String),
        lateMinutes: (json['lateMinutes'] as num).toInt(),
        method: attendanceMethodFromJson(json['method'] as String),
      );
}

DateTime? _parseOrNull(Object? value) =>
    value is String ? DateTime.parse(value) : null;
