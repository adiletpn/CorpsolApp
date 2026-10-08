import 'package:corpsol_mobile/shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('нижняя навигация', () {
    testWidgets('показывает все пять вкладок', (tester) async {
      await tester.pumpWidget(harness(const AppShell()));
      await tester.pump();

      for (final tab in TabKey.values) {
        expect(find.text(tab.label), findsWidgets);
      }
    });

    testWidgets('нажатие на вкладку переключает экран', (tester) async {
      await tester.pumpWidget(harness(const AppShell()));
      await tester.pump();

      await tester.tap(find.text('Рейтинг'));
      await tester.pump();

      // Подпись вкладки и заголовок экрана — два вхождения вместо одного.
      expect(find.text('Рейтинг'), findsNWidgets(2));
      expect(find.text('Зарплата'), findsOneWidget);
    });
  });
}
