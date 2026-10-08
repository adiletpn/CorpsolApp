import 'package:corpsol_mobile/api/client.dart';
import 'package:corpsol_mobile/core/location.dart';
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
}) =>
    CheckInController(
      api,
      readLocationOverride: location ?? () async => reading(),
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
}
