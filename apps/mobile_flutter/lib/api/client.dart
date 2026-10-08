import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/device.dart';
import '../core/env.dart';
import '../core/firebase_session.dart';

/// Ошибка API с машинным кодом — экран решает по коду, что показать.
class ApiError implements Exception {
  const ApiError(this.status, this.code, this.message, [this.details = const {}]);

  final int status;
  final String? code;
  final String message;
  final Map<String, dynamic> details;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._session, {http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        _baseUrl = baseUrl ?? Env.apiUrl;

  final SessionSource _session;
  final http.Client _http;
  final String _baseUrl;

  /// Заголовки устройства уходят с каждым запросом, а не только при входе:
  /// Firebase Auth разрешает вход с любого числа устройств, поэтому запрет
  /// «один аккаунт — один телефон» держится на серверной проверке этих значений.
  Future<Map<String, String>> _deviceHeaders() async {
    final device = await getDeviceDescriptor();

    return {
      'x-device-id': device.deviceId,
      'x-device-platform': device.platform,
      if (device.model != null) 'x-device-model': device.model!,
      if (device.osVersion != null) 'x-device-os': device.osVersion!,
      if (device.appVersion != null) 'x-app-version': device.appVersion!,
    };
  }

  ApiError _parseError(http.Response response) {
    Map<String, dynamic> body = const {};
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final nested = decoded['message'];
        body = nested is Map<String, dynamic> ? nested : decoded;
      }
    } catch (_) {
      // Тело не разобралось — остаётся только код ответа.
    }

    final code = body['code'];
    final message = body['message'];

    return ApiError(
      response.statusCode,
      code is String ? code : null,
      message is String ? message : 'Не удалось выполнить запрос',
      body,
    );
  }

  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Object? body,
    bool needsAuth = true,
  }) async {
    final headers = <String, String>{'Content-Type': 'application/json'};

    if (needsAuth) {
      final token = await _session.idToken();
      if (token == null) {
        throw const ApiError(401, 'no_session', 'Сессия не найдена, войдите заново');
      }

      headers['Authorization'] = 'Bearer $token';
      headers.addAll(await _deviceHeaders());
    }

    final uri = Uri.parse('$_baseUrl$path');
    final encoded = body == null ? null : jsonEncode(body);

    final response = switch (method) {
      'POST' => await _http.post(uri, headers: headers, body: encoded),
      'PATCH' => await _http.patch(uri, headers: headers, body: encoded),
      'DELETE' => await _http.delete(uri, headers: headers, body: encoded),
      _ => await _http.get(uri, headers: headers),
    };

    // Firebase сам обновляет токен заранее, поэтому 401 означает отзыв доступа:
    // сотрудника уволили либо устройство открепили. Повтор запроса не поможет.
    if (response.statusCode == 401 && needsAuth) {
      await _session.signOut().catchError((_) {});
      throw _parseError(response);
    }

    if (response.statusCode >= 400) throw _parseError(response);
    if (response.statusCode == 204 || response.body.isEmpty) return null;

    return jsonDecode(response.body);
  }
}
