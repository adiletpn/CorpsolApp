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

class PayrollLine {
  const PayrollLine({
    required this.ruleId,
    required this.kind,
    required this.title,
    required this.amountMinor,
  });

  final String ruleId;
  final String kind;
  final String title;

  /// Сумма в тиынах: деньги везде в минорных единицах, без дробных рублей.
  final int amountMinor;

  factory PayrollLine.fromJson(Map<String, dynamic> json) => PayrollLine(
        ruleId: json['ruleId'] as String,
        kind: json['kind'] as String,
        title: json['title'] as String,
        amountMinor: (json['amountMinor'] as num).toInt(),
      );
}

enum PayrollStatus { draft, approved, paid }

PayrollStatus payrollStatusFromJson(String value) => switch (value) {
      'APPROVED' => PayrollStatus.approved,
      'PAID' => PayrollStatus.paid,
      _ => PayrollStatus.draft,
    };

class Payroll {
  const Payroll({
    required this.id,
    required this.periodStart,
    required this.periodEnd,
    required this.baseSalaryMinor,
    required this.bonusMinor,
    required this.penaltyMinor,
    required this.totalMinor,
    required this.lines,
    required this.status,
  });

  final String id;
  final String periodStart;
  final String periodEnd;
  final int baseSalaryMinor;
  final int bonusMinor;
  final int penaltyMinor;
  final int totalMinor;
  final List<PayrollLine> lines;
  final PayrollStatus status;

  factory Payroll.fromJson(Map<String, dynamic> json) => Payroll(
        id: json['id'] as String,
        periodStart: json['periodStart'] as String,
        periodEnd: json['periodEnd'] as String,
        baseSalaryMinor: (json['baseSalaryMinor'] as num).toInt(),
        bonusMinor: (json['bonusMinor'] as num).toInt(),
        penaltyMinor: (json['penaltyMinor'] as num).toInt(),
        totalMinor: (json['totalMinor'] as num).toInt(),
        lines: (json['lines'] as List<dynamic>? ?? const [])
            .map((item) => PayrollLine.fromJson(item as Map<String, dynamic>))
            .toList(),
        status: payrollStatusFromJson(json['status'] as String),
      );
}

enum OfferStatus { sent, accepted, rejected, expired }

OfferStatus offerStatusFromJson(String value) => switch (value) {
      'ACCEPTED' => OfferStatus.accepted,
      'REJECTED' => OfferStatus.rejected,
      'EXPIRED' => OfferStatus.expired,
      _ => OfferStatus.sent,
    };

class Offer {
  const Offer({
    required this.id,
    required this.clientName,
    required this.clientPhone,
    required this.amountMinor,
    required this.status,
    required this.sentDate,
  });

  final String id;
  final String clientName;
  final String? clientPhone;
  final int amountMinor;
  final OfferStatus status;
  final String sentDate;

  factory Offer.fromJson(Map<String, dynamic> json) => Offer(
        id: json['id'] as String,
        clientName: json['clientName'] as String,
        clientPhone: json['clientPhone'] as String?,
        amountMinor: (json['amountMinor'] as num).toInt(),
        status: offerStatusFromJson(json['status'] as String),
        sentDate: json['sentDate'] as String,
      );
}
