import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/screens/home_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

AttendanceRecord record({
  required String workDate,
  AttendanceStatus status = AttendanceStatus.onTime,
  AttendanceMethod method = AttendanceMethod.qr,
  DateTime? checkInAt,
  int lateMinutes = 0,
}) =>
    AttendanceRecord(
      id: 'uid-1_$workDate',
      workDate: workDate,
      checkInAt: checkInAt,
      checkOutAt: null,
      status: status,
      lateMinutes: lateMinutes,
      method: method,
    );

void main() {
  group('главный экран: отметка за сегодня', () {
    testWidgets('без отметки предлагает отсканировать код', (tester) async {
      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: FakeApi()));
      await tester.pumpAndSettle();

      expect(find.text('Отметить приход'), findsOneWidget);
      expect(find.text('Отсканируйте QR-код на терминале в офисе'), findsOneWidget);
    });

    testWidgets('нажатие на карточку открывает скан', (tester) async {
      var opened = false;

      await tester.pumpWidget(harness(HomeScreen(onScan: () => opened = true)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Отметить приход'));
      expect(opened, isTrue);
    });
  });
}
