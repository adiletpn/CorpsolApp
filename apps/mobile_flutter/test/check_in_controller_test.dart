import 'package:corpsol_mobile/api/client.dart';
import 'package:corpsol_mobile/core/location.dart';
import 'package:corpsol_mobile/core/network.dart';
import 'package:corpsol_mobile/state/check_in_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

LocationReading reading({bool isMocked = false, double accuracy = 10}) =>
    LocationReading(
      lat: 43.238949,
      lng: 76.889709,
      accuracyMeters: accuracy,
      isMocked: isMocked,
      capturedAt: DateTime(2026, 10, 8, 9),
    );

CheckInController controllerFor(
  FakeApi api, {
  Future<LocationReading> Function()? location,
  WifiReading? wifi,
}) => CheckInController(
  api,
  readLocationOverride: location ?? () async => reading(),
  readWifiOverride: () async =>
      wifi ?? const WifiReading(bssid: null, denied: true),
);

void main() {
  group('отметка прихода: успех', () {
    test('успешная отметка переводит экран в состояние успеха', () async {
      final controller = controllerFor(FakeApi());

      await controller.submit('qr-payload');

      expect(controller.phase, CheckInPhase.success);
      expect(controller.result?.office.name, 'Главный офис');
    });
  });

  group('отметка прихода: защита от дубля', () {
    test('повторный скан того же кода второй запрос не шлёт', () async {
      final api = FakeApi();
      final controller = controllerFor(api);

      await controller.submit('qr-payload');
      await controller.submit('qr-payload');

      expect(controller.phase, CheckInPhase.success);
    });

    test('после сброса отметку можно повторить', () async {
      final controller = controllerFor(
        FakeApi(failWith: const ApiError(400, 'qr_expired', 'Код истёк')),
      );

      await controller.submit('qr-payload');
      expect(controller.phase, CheckInPhase.failure);

      controller.retry();
      expect(controller.phase, CheckInPhase.scanning);
      expect(controller.message, isNull);
    });
  });

  group('отметка прихода: отказы сервера', () {
    test(
      'истёкший код объясняет, что он обновляется каждые 30 секунд',
      () async {
        final controller = controllerFor(
          FakeApi(failWith: const ApiError(400, 'qr_expired', 'Код истёк')),
        );

        await controller.submit('qr-payload');

        expect(controller.phase, CheckInPhase.failure);
        expect(controller.code, 'qr_expired');
        expect(controller.hint, contains('30 секунд'));
      },
    );

    test('отметка вне геозоны подсказывает подойти ближе', () async {
      final controller = controllerFor(
        FakeApi(failWith: const ApiError(400, 'outside_fence', 'Вы вне офиса')),
      );

      await controller.submit('qr-payload');

      expect(controller.hint, 'Подойдите ближе к офису и повторите.');
    });

    test('чужой телефон объясняет, что отметка только со своего', () async {
      final controller = controllerFor(
        FakeApi(
          failWith: const ApiError(403, 'device_mismatch', 'Другое устройство'),
        ),
      );

      await controller.submit('qr-payload');

      expect(controller.hint, contains('закреплённого за вашим аккаунтом'));
    });

    test(
      'неизвестный код показывает сообщение сервера без подсказки',
      () async {
        final controller = controllerFor(
          FakeApi(
            failWith: const ApiError(400, 'что_то_новое', 'Непонятно что'),
          ),
        );

        await controller.submit('qr-payload');

        expect(controller.message, 'Непонятно что');
        expect(controller.hint, isNull);
      },
    );
  });

  group('отметка прихода: геолокация', () {
    test('отказ в доступе к геолокации объясняет, что делать', () async {
      final controller = controllerFor(
        FakeApi(),
        location: () async => throw const LocationDenied(),
      );

      await controller.submit('qr-payload');

      expect(controller.phase, CheckInPhase.failure);
      expect(controller.message, contains('Разрешите доступ в настройках'));
    });

    test('выключенная геолокация отличается от отказа в доступе', () async {
      final controller = controllerFor(
        FakeApi(),
        location: () async => throw const LocationServiceOff(),
      );

      await controller.submit('qr-payload');

      expect(controller.message, 'Включите геолокацию в настройках телефона.');
    });

    test('обрыв связи не выдаётся за отказ сервера', () async {
      final controller = controllerFor(
        FakeApi(),
        location: () async => throw Exception('сеть недоступна'),
      );

      await controller.submit('qr-payload');

      expect(controller.message, 'Нет связи с сервером. Попробуйте ещё раз.');
      expect(controller.code, isNull);
    });
  });

  group('отметка прихода: офисный Wi-Fi', () {
    test('адрес точки доступа уходит вместе с отметкой', () async {
      final api = FakeApi();
      final controller = controllerFor(
        api,
        wifi: const WifiReading(bssid: 'A1:B2:C3:D4:E5:F6', denied: false),
      );

      await controller.submit('qr-payload');

      expect(api.lastCheckIn?['wifiBssid'], 'A1:B2:C3:D4:E5:F6');
    });

    test('без доступа к сети отметка всё равно отправляется', () async {
      final api = FakeApi();
      final controller = controllerFor(
        api,
        wifi: const WifiReading(bssid: null, denied: true),
      );

      await controller.submit('qr-payload');

      // Wi-Fi — вспомогательный фактор. Обязателен он или нет, решает
      // сервер по настройкам офиса, а не телефон за него.
      expect(controller.phase, CheckInPhase.success);
      expect(api.lastCheckIn?['wifiBssid'], isNull);
    });

    test('чужая сеть объясняется подключением к офисной', () async {
      final api = FakeApi()
        ..failWith = const ApiError(
          422,
          'wifi_mismatch',
          'Телефон не в офисной сети Wi-Fi — отметка недоступна.',
          {'wifiMissing': false},
        );
      final controller = controllerFor(api);

      await controller.submit('qr-payload');

      expect(controller.hint, contains('рабочему Wi-Fi'));
    });

    test('выключенный Wi-Fi просят включить, а не выбрать сеть', () async {
      final api = FakeApi()
        ..failWith = const ApiError(
          422,
          'wifi_mismatch',
          'Телефон не в офисной сети Wi-Fi — отметка недоступна.',
          {'wifiMissing': true},
        );
      final controller = controllerFor(api);

      await controller.submit('qr-payload');

      // Советовать выбрать сеть тому, у кого Wi-Fi выключен, бессмысленно.
      expect(controller.hint, contains('Включите'));
    });
  });
}
