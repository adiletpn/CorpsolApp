import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/screens/home_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

AttendanceRecord record({
  required String workDate,
  AttendanceStatus status = AttendanceStatus.onTime,
  AttendanceMethod method = AttendanceMethod.qr,
  DateTime? checkInAt,
  DateTime? checkOutAt,
  int lateMinutes = 0,
}) => AttendanceRecord(
  id: 'uid-1_$workDate',
  workDate: workDate,
  checkInAt: checkInAt,
  checkOutAt: checkOutAt,
  status: status,
  lateMinutes: lateMinutes,
  method: method,
);

void main() {
  setUpAll(initLocale);

  group('главный экран: отметка за сегодня', () {
    testWidgets('без отметки предлагает отсканировать код', (tester) async {
      await tester.pumpWidget(
        harness(HomeScreen(onScan: () {}), api: FakeApi()),
      );
      await tester.pumpAndSettle();

      expect(find.text('Отметить приход'), findsOneWidget);
      expect(
        find.text('Отсканируйте QR-код на терминале в офисе'),
        findsOneWidget,
      );
    });

    testWidgets('нажатие на карточку открывает скан', (tester) async {
      var opened = false;

      await tester.pumpWidget(harness(HomeScreen(onScan: () => opened = true)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Отметить приход'));
      expect(opened, isTrue);
    });
  });

  group('главный экран: уже отмечен', () {
    testWidgets('после отметки карточка не ведёт на скан', (tester) async {
      final today = DateTime.now();
      final key =
          '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

      var opened = false;
      await tester.pumpWidget(
        harness(
          HomeScreen(onScan: () => opened = true),
          api: FakeApi(
            attendance: [record(workDate: key, checkInAt: today)],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Приход отмечен'), findsOneWidget);
      await tester.tap(find.text('Приход отмечен'));
      expect(opened, isFalse);
    });

    testWidgets('вчерашняя отметка сегодняшнюю не заменяет', (tester) async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final key =
          '${yesterday.year}-${yesterday.month.toString().padLeft(2, '0')}-${yesterday.day.toString().padLeft(2, '0')}';

      await tester.pumpWidget(
        harness(
          HomeScreen(onScan: () {}),
          api: FakeApi(
            attendance: [record(workDate: key, checkInAt: yesterday)],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Отметить приход'), findsOneWidget);
    });
  });

  group('главный экран: уход', () {
    String todayKey() {
      final now = DateTime.now();
      return '${now.year}-${now.month.toString().padLeft(2, '0')}'
          '-${now.day.toString().padLeft(2, '0')}';
    }

    testWidgets('после прихода предлагает отметить уход', (tester) async {
      final api = FakeApi(
        attendance: [record(workDate: todayKey(), checkInAt: DateTime.now())],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      expect(find.text('Не забудьте отметить уход'), findsOneWidget);
      expect(find.text('Ухожу'), findsOneWidget);
    });

    testWidgets('нажатие отправляет отметку ухода', (tester) async {
      final api = FakeApi(
        attendance: [record(workDate: todayKey(), checkInAt: DateTime.now())],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Ухожу'));
      await tester.pumpAndSettle();

      expect(api.leftAt, isNotNull);
    });

    testWidgets('закрытая смена показывает время ухода без кнопки', (
      tester,
    ) async {
      final api = FakeApi(
        attendance: [
          record(
            workDate: todayKey(),
            checkInAt: DateTime.now(),
            checkOutAt: DateTime(2026, 10, 9, 18, 5),
          ),
        ],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      expect(find.textContaining('Ушли в 18:05'), findsOneWidget);
      expect(find.text('Ухожу'), findsNothing);
    });

    testWidgets('до прихода кнопки ухода нет', (tester) async {
      await tester.pumpWidget(harness(HomeScreen(onScan: () {})));
      await tester.pumpAndSettle();

      expect(find.text('Ухожу'), findsNothing);
    });
  });
}
