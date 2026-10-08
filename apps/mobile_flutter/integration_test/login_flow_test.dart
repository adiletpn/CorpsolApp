import 'package:corpsol_mobile/api/client.dart';
import 'package:corpsol_mobile/api/endpoints.dart';
import 'package:corpsol_mobile/core/firebase_session.dart';
import 'package:corpsol_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Сквозная проверка против поднятых эмуляторов Firebase и живого бэкенда.
/// Запуск:
///   ./scripts/dev.sh emulators && ./scripts/dev.sh seed && ./scripts/dev.sh api
///   flutter test integration_test/login_flow_test.dart -d <симулятор> \
///     --dart-define=API_URL=http://localhost:3001/api \
///     --dart-define=FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 ...
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late FirebaseSession session;
  late CorpsolApi api;

  setUpAll(() async {
    await initializeDateFormatting('ru');
    session = await FirebaseSession.initialize();
    api = CorpsolApi(ApiClient(session));
    // Прошлый прогон мог оставить сессию — начинаем с чистого экрана входа.
    await session.signOut();
  });

  /// Вход менеджера с экрана входа. Каждый тест начинает с чистого состояния,
  /// поэтому порядок тестов ни на что не влияет.
  Future<void> signInAsManager(WidgetTester tester) async {
    await tester.enterText(find.byType(TextField).first, 'mop1@corpsol.kz');
    await tester.enterText(find.byType(TextField).last, 'CorpSol2026!');
    await tester.tap(find.text('Войти'));
    // Вход идёт в два шага: Firebase, затем наша сессия с проверкой телефона.
    await tester.pumpAndSettle(const Duration(seconds: 15));
  }

  testWidgets('менеджер входит и попадает на свой табель', (tester) async {
    await tester.pumpWidget(CorpsolApp(session: session, api: api));
    await tester.pumpAndSettle();

    expect(find.text('Вход для менеджера'), findsOneWidget);

    await signInAsManager(tester);

    expect(find.text('Менеджер отдела продаж'), findsOneWidget);
    expect(find.text('Отметить приход'), findsOneWidget);
  });

  testWidgets('неверный пароль не пускает и объясняет причину', (tester) async {
    await session.signOut();

    await tester.pumpWidget(CorpsolApp(session: session, api: api));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'mop1@corpsol.kz');
    await tester.enterText(find.byType(TextField).last, 'не-тот-пароль');
    await tester.tap(find.text('Войти'));
    await tester.pumpAndSettle(const Duration(seconds: 10));

    expect(find.text('Неверная почта или пароль'), findsOneWidget);
  });

  testWidgets('все вкладки открываются на живых данных', (tester) async {
    await session.signOut();

    await tester.pumpWidget(CorpsolApp(session: session, api: api));
    await tester.pumpAndSettle(const Duration(seconds: 10));
    await signInAsManager(tester);

    expect(find.text('Менеджер отдела продаж'), findsOneWidget);

    for (final tab in ['Сделки', 'Зарплата', 'Рейтинг', 'Награды']) {
      await tester.tap(find.text(tab));
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Заголовок экрана совпадает с подписью вкладки — значит вкладка
      // открылась и обвязка дождалась ответа бэкенда, а не повисла.
      expect(find.text(tab), findsNWidgets(2), reason: 'вкладка $tab');

      // Крутилки на экране остаться не должно.
      expect(
        find.byType(CircularProgressIndicator),
        findsNothing,
        reason: 'вкладка $tab осталась в загрузке',
      );
    }

    await tester.tap(find.text('Приход'));
    await tester.pumpAndSettle(const Duration(seconds: 10));
    expect(find.text('Табель за месяц'), findsOneWidget);
  });
}
