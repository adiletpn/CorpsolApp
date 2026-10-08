import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/location.dart';

/// Подсказки поверх сообщения сервера: что именно сотруднику сделать.
const checkInActionHints = <String, String>{
  'outside_fence': 'Подойдите ближе к офису и повторите.',
  'accuracy_too_low':
      'Выйдите ближе к окну или на улицу — сигнал GPS слишком слабый.',
  'mocked_location': 'Отключите приложения подмены геолокации.',
  'qr_expired': 'Код на экране обновляется каждые 30 секунд — отсканируйте заново.',
  'qr_invalid': 'Это не код терминала. Сканируйте код с экрана в офисе.',
  'already_checked_in': 'Приход на сегодня уже отмечен.',
  'device_not_bound': 'Телефон не закреплён за аккаунтом. Обратитесь к ЧР.',
  'device_mismatch':
      'Отметка возможна только с телефона, закреплённого за вашим аккаунтом.',
  'employee_inactive': 'Учётная запись неактивна. Обратитесь к ЧР.',
};

enum CheckInPhase { scanning, submitting, success, failure }

/// Чтение координат вынесено в параметр: в тестах настоящий GPS недоступен.
typedef LocationReader = Future<LocationReading> Function();

class CheckInController extends ChangeNotifier {
  CheckInController(this._api, {LocationReader? readLocationOverride})
      : _readLocation = readLocationOverride ?? readLocation;

  final CorpsolApi _api;
  final LocationReader _readLocation;

  CheckInPhase _phase = CheckInPhase.scanning;
  String _step = '';
  String? _message;
  String? _code;
  CheckInResponse? _result;

  CheckInPhase get phase => _phase;
  String get step => _step;
  String? get message => _message;
  String? get code => _code;
  CheckInResponse? get result => _result;

  /// Подсказка под сообщением сервера, если для кода она есть.
  String? get hint => _code == null ? null : checkInActionHints[_code];

  /// Камера успевает отдать один и тот же код несколько раз подряд —
  /// защёлка не даёт отправить дубль запроса.
  bool _locked = false;

  Future<void> submit(String qr) async {
    if (_locked) return;
    _locked = true;

    try {
      _enterSubmitting('Определяем местоположение…');
      final location = await _readLocation();

      _enterSubmitting('Подтверждаем приход…');
      final result = await _api.checkIn(
        qr: qr,
        lat: location.lat,
        lng: location.lng,
        accuracyMeters: location.accuracyMeters,
        isMocked: location.isMocked,
      );

      _phase = CheckInPhase.success;
      _result = result;
      _message = null;
      _code = null;
    } on LocationDenied {
      _fail('Без доступа к геолокации отметка невозможна. '
          'Разрешите доступ в настройках.');
    } on LocationServiceOff {
      _fail('Включите геолокацию в настройках телефона.');
    } on ApiError catch (error) {
      _fail(error.message, error.code);
    } catch (_) {
      _fail('Нет связи с сервером. Попробуйте ещё раз.');
    }

    notifyListeners();
  }

  void retry() {
    _locked = false;
    _phase = CheckInPhase.scanning;
    _message = null;
    _code = null;
    _result = null;
    notifyListeners();
  }

  void _enterSubmitting(String step) {
    _phase = CheckInPhase.submitting;
    _step = step;
    notifyListeners();
  }

  void _fail(String message, [String? code]) {
    _phase = CheckInPhase.failure;
    _message = message;
    _code = code;
  }
}
