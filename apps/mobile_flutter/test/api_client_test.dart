import 'dart:convert';

import 'package:corpsol_mobile/api/client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

/// Ответ сервера в UTF-8. Конструктор http.Response кодирует строку
/// в latin1 и на кириллице падает — настоящий сервер шлёт байты.
http.Response utf8Response(String body, int status) => http.Response.bytes(
  utf8.encode(body),
  status,
  headers: const {'content-type': 'application/json'},
);

/// Перехватывает запросы и отдаёт заданный ответ, запоминая заголовки.
class Recorder {
  final List<http.BaseRequest> requests = [];

  MockClient client(http.Response Function(http.Request) handler) =>
      MockClient((request) async {
        requests.add(request);
        return handler(request);
      });
}

void main() {
  group('клиент API: токен и устройство', () {
    test('без сессии запрос не уходит вовсе', () async {
      final session = FakeSession()..tokenOverride = null;
      final recorder = Recorder();
      final client = ApiClient(
        session,
        httpClient: recorder.client((_) => http.Response('{}', 200)),
        baseUrl: 'http://test/api',
      );

      await expectLater(
        client.request('/auth/session'),
        throwsA(isA<ApiError>().having((e) => e.code, 'код', 'no_session')),
      );
      expect(recorder.requests, isEmpty);
    });

    test('запрос без авторизации токена не требует', () async {
      final recorder = Recorder();
      final client = ApiClient(
        FakeSession()..tokenOverride = null,
        httpClient: recorder.client((_) => http.Response('{"ok":true}', 200)),
        baseUrl: 'http://test/api',
      );

      await client.request('/health', needsAuth: false);

      expect(recorder.requests, hasLength(1));
      expect(
        recorder.requests.single.headers.containsKey('Authorization'),
        isFalse,
      );
    });
  });

  group('клиент API: разбор ошибок', () {
    test('код отказа достаётся из вложенного message', () async {
      final recorder = Recorder();
      final client = ApiClient(
        FakeSession(),
        httpClient: recorder.client(
          (_) => utf8Response(
            jsonEncode({
              'message': {'code': 'qr_expired', 'message': 'Код истёк'},
            }),
            400,
          ),
        ),
        baseUrl: 'http://test/api',
      );

      await expectLater(
        client.request('/attendance/check-in', method: 'POST'),
        throwsA(
          isA<ApiError>()
              .having((e) => e.code, 'код', 'qr_expired')
              .having((e) => e.message, 'сообщение', 'Код истёк'),
        ),
      );
    });

    test('нечитаемое тело ответа не роняет клиент', () async {
      final recorder = Recorder();
      final client = ApiClient(
        FakeSession(),
        httpClient: recorder.client(
          (_) => utf8Response('<html>502</html>', 502),
        ),
        baseUrl: 'http://test/api',
      );

      await expectLater(
        client.request('/plans'),
        throwsA(
          isA<ApiError>()
              .having((e) => e.status, 'статус', 502)
              .having(
                (e) => e.message,
                'сообщение',
                'Не удалось выполнить запрос',
              ),
        ),
      );
    });

    test('ответ 401 выкидывает из аккаунта: доступ отозван', () async {
      final session = FakeSession();
      final recorder = Recorder();
      final client = ApiClient(
        session,
        httpClient: recorder.client(
          (_) => http.Response(jsonEncode({'code': 'device_mismatch'}), 401),
        ),
        baseUrl: 'http://test/api',
      );

      await expectLater(client.request('/plans'), throwsA(isA<ApiError>()));
      expect(session.signedOut, isTrue);
    });

    test('ответ 204 возвращает пустоту, а не ошибку разбора', () async {
      final recorder = Recorder();
      final client = ApiClient(
        FakeSession(),
        httpClient: recorder.client((_) => http.Response('', 204)),
        baseUrl: 'http://test/api',
      );

      expect(await client.request('/auth/logout', method: 'POST'), isNull);
    });
  });
}
