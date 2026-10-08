import 'package:corpsol_mobile/shell.dart';
import 'package:corpsol_mobile/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget wrap(Widget child) => MaterialApp(theme: buildTheme(), home: child);

void main() {
  group('нижняя навигация', () {
    testWidgets('показывает все пять вкладок', (tester) async {
      await tester.pumpWidget(wrap(const AppShell()));

      for (final tab in TabKey.values) {
        expect(find.text(tab.label), findsWidgets);
      }
    });

    testWidgets('при запуске открыт «Приход»', (tester) async {
      await tester.pumpWidget(wrap(const AppShell()));

      // Подпись вкладки и заголовок экрана — два вхождения вместо одного.
      expect(find.text('Приход'), findsNWidgets(2));
      expect(find.text('Зарплата'), findsOneWidget);
    });

    testWidgets('нажатие на вкладку переключает экран', (tester) async {
      await tester.pumpWidget(wrap(const AppShell()));

      await tester.tap(find.text('Рейтинг'));
      await tester.pumpAndSettle();

      expect(find.text('Рейтинг'), findsNWidgets(2));
      expect(find.text('Приход'), findsOneWidget);
    });
  });
}
