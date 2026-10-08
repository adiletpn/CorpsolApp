import 'package:corpsol_mobile/api/client.dart';
import 'package:corpsol_mobile/api/endpoints.dart';
import 'package:corpsol_mobile/core/firebase_session.dart';
import 'package:corpsol_mobile/main.dart';
import 'package:corpsol_mobile/state/theme_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Открывает одну вкладку и удерживает её, пока снаружи снимают экран.
/// Нужен для демонстрации: кликать по симулятору из командной строки нельзя.
///
///   flutter test integration_test/demo_tab_test.dart -d <симулятор> \
///     --dart-define=DEMO_TAB=Сделки --dart-define=DEMO_HOLD=25
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const tab = String.fromEnvironment('DEMO_TAB', defaultValue: 'Приход');
  const holdSeconds = int.fromEnvironment('DEMO_HOLD', defaultValue: 25);
  const themeName = String.fromEnvironment('DEMO_THEME', defaultValue: 'light');

  testWidgets('показ вкладки «$tab»', (tester) async {
    await initializeDateFormatting('ru');

    final session = await FirebaseSession.initialize();
    final api = CorpsolApi(ApiClient(session));
    final theme = ThemeController(null);
    await theme.set(themeName == 'dark' ? ThemeMode.dark : ThemeMode.light);

    await tester.pumpWidget(
      CorpsolApp(session: session, api: api, theme: theme),
    );
    await tester.pumpAndSettle(const Duration(seconds: 10));

    // Сессия могла не сохраниться между сборками — тогда входим.
    if (find.text('Вход для менеджера').evaluate().isNotEmpty) {
      await tester.enterText(find.byType(TextField).first, 'mop1@corpsol.kz');
      await tester.enterText(find.byType(TextField).last, 'CorpSol2026!');
      await tester.tap(find.text('Войти'));
      await tester.pumpAndSettle(const Duration(seconds: 15));
    }

    if (tab != 'Приход') {
      await tester.tap(find.text(tab));
      await tester.pumpAndSettle(const Duration(seconds: 10));
    }

    // Держим экран: снимок делается снаружи через simctl.
    for (var i = 0; i < holdSeconds; i += 1) {
      await tester.pump(const Duration(seconds: 1));
      await Future<void>.delayed(const Duration(seconds: 1));
    }
  });
}
