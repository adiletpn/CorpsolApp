import '../core/device.dart';
import 'client.dart';
import 'models.dart';

/// Запросы, которые делает приложение МОПа. Каждый метод возвращает
/// разобранную модель — экраны с сырым JSON не работают.
class CorpsolApi {
  const CorpsolApi(this._client);

  final ApiClient _client;

  /// Первый запрос после входа: закрепляет аккаунт за телефоном
  /// и возвращает профиль сотрудника.
  Future<AuthUser> openSession() async {
    final device = await getDeviceDescriptor();

    final json = await _client.request(
      '/auth/session',
      method: 'POST',
      body: {
        'device': {
          'deviceId': device.deviceId,
          'platform': device.platform,
          if (device.model != null) 'model': device.model,
          if (device.osVersion != null) 'osVersion': device.osVersion,
          if (device.appVersion != null) 'appVersion': device.appVersion,
        },
      },
    );
    return AuthUser.fromJson(json as Map<String, dynamic>);
  }

  /// Выход: бэкенд гасит токены, чтобы на устройстве не осталось доступа.
  Future<void> closeSession() => _client.request('/auth/logout', method: 'POST');

  Future<CheckInResponse> checkIn({
    required String qr,
    required double lat,
    required double lng,
    required double accuracyMeters,
    required bool isMocked,
    String? wifiBssid,
  }) async {
    final json = await _client.request(
      '/attendance/check-in',
      method: 'POST',
      body: {
        'qr': qr,
        'lat': lat,
        'lng': lng,
        'accuracyMeters': accuracyMeters,
        'isMocked': isMocked,
        if (wifiBssid != null) 'wifiBssid': wifiBssid,
      },
    );
    return CheckInResponse.fromJson(json as Map<String, dynamic>);
  }

  /// Свой табель за период.
  Future<List<AttendanceRecord>> myAttendance({
    required String from,
    required String to,
  }) async {
    final json = await _client.request(
      '/attendance/me?from=${Uri.encodeQueryComponent(from)}'
      '&to=${Uri.encodeQueryComponent(to)}',
    );
    return (json as List<dynamic>)
        .map((item) => AttendanceRecord.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<LeaderboardResult> leaderboard({
    required String from,
    required String to,
  }) async {
    final json = await _client.request('/gamification/leaderboard?from=$from&to=$to');
    return LeaderboardResult.fromJson(json as Map<String, dynamic>);
  }

  Future<List<Payroll>> payroll(String periodStart) async {
    final json = await _client.request('/payroll?periodStart=$periodStart');
    return (json as List<dynamic>)
        .map((item) => Payroll.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<Offer>> offers({required String from, required String to}) async {
    final json = await _client.request('/offers?from=$from&to=$to');
    return (json as List<dynamic>)
        .map((item) => Offer.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<Plan>> plans(String periodStart) async {
    final json = await _client.request('/plans?periodStart=$periodStart');
    return (json as List<dynamic>)
        .map((item) => Plan.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<Achievement>> achievements() async {
    final json = await _client.request('/gamification/achievements');
    return (json as List<dynamic>)
        .map((item) => Achievement.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}
