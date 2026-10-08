import 'package:corpsol_mobile/api/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('разбор ответа: сотрудник', () {
    test('необязательные поля приходят пустыми, а не ломают разбор', () {
      final user = AuthUser.fromJson(const {
        'id': 'uid-1',
        'email': 'asel@corpsol.kz',
        'fullName': 'Асель Ким',
        'role': 'MOP',
        'departmentId': null,
        'officeId': null,
        'boundDeviceId': null,
      });

      expect(user.departmentId, isNull);
      expect(user.boundDeviceId, isNull);
      expect(user.role, Role.mop);
    });

    test('незнакомая роль считается рядовым сотрудником, а не падает', () {
      expect(roleFromJson('НОВАЯ_РОЛЬ'), Role.mop);
    });

    test('все роли из матрицы прав разбираются', () {
      expect(roleFromJson('SUPER_ADMIN'), Role.superAdmin);
      expect(roleFromJson('DIRECTOR'), Role.director);
      expect(roleFromJson('HR'), Role.hr);
      expect(roleFromJson('ROP'), Role.rop);
    });
  });

  group('разбор ответа: отметка посещаемости', () {
    test('день без отметки приходит с пустым временем', () {
      final record = AttendanceRecord.fromJson(const {
        'id': 'uid-1_2026-10-07',
        'workDate': '2026-10-07',
        'checkInAt': null,
        'checkOutAt': null,
        'status': 'ABSENT',
        'lateMinutes': 0,
        'method': 'AUTO_ABSENCE',
      });

      expect(record.checkInAt, isNull);
      expect(record.status, AttendanceStatus.absent);
      expect(record.method, AttendanceMethod.autoAbsence);
    });

    test('способ отметки отличает скан от правки руководителем', () {
      expect(attendanceMethodFromJson('QR'), AttendanceMethod.qr);
      expect(
        attendanceMethodFromJson('MANUAL_ADJUSTMENT'),
        AttendanceMethod.manualAdjustment,
      );
    });
  });

  group('разбор ответа: зарплата', () {
    test('расчёт без строк разбора не ломается', () {
      final payroll = Payroll.fromJson(const {
        'id': 'pay-1',
        'periodStart': '2026-10-01',
        'periodEnd': '2026-10-31',
        'baseSalaryMinor': 30000000,
        'bonusMinor': 0,
        'penaltyMinor': 0,
        'totalMinor': 30000000,
        'status': 'DRAFT',
      });

      expect(payroll.lines, isEmpty);
      expect(payroll.status, PayrollStatus.draft);
    });
  });

  group('разбор ответа: рейтинг', () {
    test('сотрудник вне видимой части списка приходит отдельной строкой', () {
      final board = LeaderboardResult.fromJson(const {
        'entries': <Map<String, dynamic>>[],
        'self': {
          'userId': 'uid-1',
          'fullName': 'Асель Ким',
          'points': 10,
          'rank': 42,
          'pointsBehindLeader': 110,
        },
      });

      expect(board.entries, isEmpty);
      expect(board.self?.rank, 42);
    });

    test('рейтинг без своей строки разбирается', () {
      final board = LeaderboardResult.fromJson(const {
        'entries': <Map<String, dynamic>>[],
        'self': null,
      });

      expect(board.self, isNull);
    });
  });

  group('разбор ответа: часовой пояс', () {
    test('момент в UTC переводится в местное время телефона', () {
      final record = AttendanceRecord.fromJson(const {
        'id': 'uid-1_2026-10-07',
        'workDate': '2026-10-07',
        'checkInAt': '2026-10-07T04:00:00.000Z',
        'checkOutAt': null,
        'status': 'ON_TIME',
        'lateMinutes': 0,
        'method': 'QR',
      });

      expect(
        record.checkInAt!.isUtc,
        isFalse,
        reason: 'время должно быть местным, иначе печатается смещённым',
      );
      expect(
        record.checkInAt!.toUtc(),
        DateTime.utc(2026, 10, 7, 4),
        reason: 'сам момент меняться не должен',
      );
    });

    test('отметка прихода тоже переводится в местное', () {
      final response = CheckInResponse.fromJson(const {
        'id': 'uid-1_2026-10-07',
        'status': 'ON_TIME',
        'lateMinutes': 0,
        'checkInAt': '2026-10-07T04:00:00.000Z',
        'office': {'id': 'office-1', 'name': 'Главный офис'},
        'distanceMeters': 12,
      });

      expect(response.checkInAt.isUtc, isFalse);
    });
  });
}
