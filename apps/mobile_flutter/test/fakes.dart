import 'dart:async';

import 'package:corpsol_mobile/api/endpoints.dart';
import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/core/firebase_session.dart';
import 'package:corpsol_mobile/state/auth_controller.dart';
import 'package:corpsol_mobile/theme.dart';
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Даты показываются по-русски, и без данных локали DateFormat падает.
/// В приложении это делает main, в тестах — setUpAll.
Future<void> initLocale() => initializeDateFormatting('ru');

/// Сессия без Firebase: тесты управляют входом вручную.
class FakeSession implements SessionSource {
  final _controller = StreamController<Object?>.broadcast();

  bool signedOut = false;

  /// Позволяет проверить поведение без сессии.
  String? tokenOverride = 'test-token';

  /// Если задано, вход падает с этой причиной.
  Object? signInFailure;

  @override
  Stream<Object?> get changes => _controller.stream;

  void emitSignedIn() => _controller.add(Object());

  void emitSignedOut() => _controller.add(null);

  @override
  Future<void> signIn(String email, String password) async {
    if (signInFailure != null) throw signInFailure!;
    emitSignedIn();
  }

  @override
  Future<void> signOut() async {
    signedOut = true;
    emitSignedOut();
  }

  @override
  Future<String?> idToken() async => tokenOverride;

  void dispose() => _controller.close();
}

/// Бэкенд, который отдаёт заранее заданные ответы. Приватные поля настоящего
/// класса в интерфейс не входят, поэтому хватает implements.
class FakeApi implements CorpsolApi {
  FakeApi({
    this.attendance = const [],
    this.offersList = const [],
    this.payrollList = const [],
    this.plansList = const [],
    this.achievementsList = const [],
    this.leaderboardResult,
    this.failWith,
  });

  List<AttendanceRecord> attendance;
  List<Offer> offersList;
  List<Payroll> payrollList;
  List<Plan> plansList;
  List<Achievement> achievementsList;
  LeaderboardResult? leaderboardResult;

  /// Если задано, любой запрос падает с этой ошибкой.
  Object? failWith;

  int sessionsOpened = 0;
  int sessionsClosed = 0;

  T _answer<T>(T value) {
    if (failWith != null) throw failWith!;
    return value;
  }

  @override
  Future<AuthUser> openSession() async {
    sessionsOpened += 1;
    return _answer(
      const AuthUser(
        id: 'uid-1',
        email: 'asel@corpsol.kz',
        fullName: 'Асель Ким',
        role: Role.mop,
        departmentId: 'dep-1',
        officeId: 'office-1',
        boundDeviceId: 'phone-1',
      ),
    );
  }

  @override
  Future<void> closeSession() async => sessionsClosed += 1;

  @override
  Future<List<AttendanceRecord>> myAttendance({
    required String from,
    required String to,
  }) async => _answer(attendance);

  @override
  Future<LeaderboardResult> leaderboard({
    required String from,
    required String to,
  }) async => _answer(
    leaderboardResult ?? const LeaderboardResult(entries: [], self: null),
  );

  @override
  Future<List<Payroll>> payroll(String periodStart) async =>
      _answer(payrollList);

  @override
  Future<List<Offer>> offers({
    required String from,
    required String to,
  }) async => _answer(offersList);

  @override
  Future<List<Plan>> plans(String periodStart) async => _answer(plansList);

  @override
  Future<List<Achievement>> achievements() async => _answer(achievementsList);

  @override
  Future<CheckInResponse> checkIn({
    required String qr,
    required double lat,
    required double lng,
    required double accuracyMeters,
    required bool isMocked,
    String? wifiBssid,
  }) async => _answer(
    CheckInResponse(
      id: 'uid-1_2026-10-08',
      status: AttendanceStatus.onTime,
      lateMinutes: 0,
      checkInAt: DateTime(2026, 10, 8, 9, 0),
      office: const OfficeRef(id: 'office-1', name: 'Главный офис'),
      distanceMeters: 12,
    ),
  );
}

/// Оборачивает экран в те же провайдеры, что и настоящее приложение.
Widget harness(
  Widget child, {
  FakeApi? api,
  FakeSession? session,
  bool signedIn = true,
}) {
  final fakeApi = api ?? FakeApi();
  final fakeSession = session ?? FakeSession();
  final auth = AuthController(fakeSession, fakeApi);

  if (signedIn) fakeSession.emitSignedIn();

  return MultiProvider(
    providers: [
      Provider<CorpsolApi>.value(value: fakeApi),
      ChangeNotifierProvider<AuthController>.value(value: auth),
    ],
    // Material нужен так же, как Scaffold в приложении: без него InkWell падает.
    child: MaterialApp(
      theme: buildTheme(),
      home: Material(child: child),
    ),
  );
}
