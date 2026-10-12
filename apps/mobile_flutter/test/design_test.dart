import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/palette.dart';
import 'package:corpsol_mobile/screens/home_screen.dart';
import 'package:corpsol_mobile/widgets/list.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

AttendanceRecord day({
  required String workDate,
  required AttendanceStatus status,
  int lateMinutes = 0,
}) => AttendanceRecord(
  id: 'uid-1_$workDate',
  workDate: workDate,
  checkInAt: status == AttendanceStatus.absent
      ? null
      : DateTime(2026, 10, 7, 9, lateMinutes),
  checkOutAt: null,
  status: status,
  lateMinutes: lateMinutes,
  method: AttendanceMethod.qr,
);

/// Засечки, которые реально нарисованы на экране.
List<Color> accents(WidgetTester tester) => tester
    .widgetList<PanelRow>(find.byType(PanelRow))
    .map((row) => row.accent)
    .nonNulls
    .toList();

void main() {
  setUpAll(initLocale);

  group('цвет отмечает только отклонения', () {
    testWidgets('месяц без происшествий остаётся без засечек', (tester) async {
      final api = FakeApi(
        attendance: [
          day(workDate: '2026-10-01', status: AttendanceStatus.onTime),
          day(workDate: '2026-10-02', status: AttendanceStatus.onTime),
          day(workDate: '2026-10-05', status: AttendanceStatus.onTime),
        ],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      // Подсвеченная норма прячет исключение: если красить всё,
      // опоздание перестаёт бросаться в глаза.
      expect(accents(tester), isEmpty);
    });

    testWidgets('опоздание и прогул получают засечку, остальные нет', (
      tester,
    ) async {
      final api = FakeApi(
        attendance: [
          day(workDate: '2026-10-01', status: AttendanceStatus.onTime),
          day(
            workDate: '2026-10-02',
            status: AttendanceStatus.late,
            lateMinutes: 15,
          ),
          day(workDate: '2026-10-05', status: AttendanceStatus.absent),
          day(workDate: '2026-10-06', status: AttendanceStatus.onTime),
        ],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      final marks = accents(tester);
      expect(marks, hasLength(2));
      expect(marks, contains(AppPalette.dark.warning));
      expect(marks, contains(AppPalette.dark.danger));
    });

    testWidgets('опоздание подписано минутами, обычный день — нет', (
      tester,
    ) async {
      final api = FakeApi(
        attendance: [
          day(
            workDate: '2026-10-02',
            status: AttendanceStatus.late,
            lateMinutes: 15,
          ),
        ],
      );

      await tester.pumpWidget(harness(HomeScreen(onScan: () {}), api: api));
      await tester.pumpAndSettle();

      expect(find.text('Опоздание 15 мин'), findsOneWidget);
    });
  });

  group('панель держит строки одной группой', () {
    testWidgets('между строками разделители, по краю одна рамка', (
      tester,
    ) async {
      await tester.pumpWidget(
        harness(
          const Panel(
            children: [
              PanelRow(title: 'Первая'),
              PanelRow(title: 'Вторая'),
              PanelRow(title: 'Третья'),
            ],
          ),
        ),
      );

      // Разделителей на один меньше, чем строк: у края их нет.
      expect(find.byType(Divider), findsNWidgets(2));
      expect(find.byType(PanelRow), findsNWidgets(3));
    });

    testWidgets('одна строка обходится без разделителей', (tester) async {
      await tester.pumpWidget(
        harness(const Panel(children: [PanelRow(title: 'Одна')])),
      );

      expect(find.byType(Divider), findsNothing);
    });
  });
}
