import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/screens/achievements_screen.dart';
import 'package:corpsol_mobile/screens/leaderboard_screen.dart';
import 'package:corpsol_mobile/screens/offers_screen.dart';
import 'package:corpsol_mobile/screens/payroll_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// Неразрывный пробел между разрядами. Записан кодом намеренно:
/// от обычного он в исходнике неотличим.
const nbsp = '\u00A0';

void main() {
  setUpAll(initLocale);

  group('пустые состояния', () {
    testWidgets('зарплата без расчёта всё равно показывает заголовок', (
      tester,
    ) async {
      await tester.pumpWidget(harness(const PayrollScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Зарплата'), findsOneWidget);
      expect(find.text('Расчёт за этот месяц ещё не готов'), findsOneWidget);
    });

    testWidgets('сделок нет — объясняем, а не показываем пустоту', (
      tester,
    ) async {
      await tester.pumpWidget(harness(const OffersScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Сделки'), findsOneWidget);
      expect(find.text('За этот месяц сделок пока нет'), findsOneWidget);
    });
  });

  group('зарплата', () {
    testWidgets('показывает итог и разбор начислений', (tester) async {
      final api = FakeApi(
        payrollList: [
          Payroll(
            id: 'pay-1',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-31',
            baseSalaryMinor: 30000000,
            bonusMinor: 5000000,
            penaltyMinor: 500000,
            totalMinor: 34500000,
            status: PayrollStatus.approved,
            lines: const [
              PayrollLine(
                ruleId: 'r1',
                kind: 'BONUS',
                title: 'Перевыполнение плана',
                amountMinor: 5000000,
              ),
            ],
          ),
        ],
      );

      await tester.pumpWidget(harness(const PayrollScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('345${nbsp}000 ₸'), findsOneWidget);
      expect(find.text('Перевыполнение плана'), findsOneWidget);
      // Ярлык шапки набран прописными.
      expect(find.text('УТВЕРЖДЁН'), findsOneWidget);
    });
  });

  group('рейтинг', () {
    testWidgets('показывает своё место и отставание от первого', (
      tester,
    ) async {
      final api = FakeApi(
        leaderboardResult: const LeaderboardResult(
          entries: [
            RankedEntry(
              userId: 'uid-2',
              fullName: 'Данияр Абенов',
              points: 120,
              rank: 1,
              pointsBehindLeader: 0,
            ),
            RankedEntry(
              userId: 'uid-1',
              fullName: 'Асель Ким',
              points: 90,
              rank: 2,
              pointsBehindLeader: 30,
            ),
          ],
          self: RankedEntry(
            userId: 'uid-1',
            fullName: 'Асель Ким',
            points: 90,
            rank: 2,
            pointsBehindLeader: 30,
          ),
        ),
      );

      await tester.pumpWidget(harness(const LeaderboardScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.textContaining('до первого места 30'), findsOneWidget);
      expect(find.text('Данияр Абенов'), findsOneWidget);
    });
  });

  group('награды', () {
    testWidgets('разделяет полученные и те, что ещё цель', (tester) async {
      final api = FakeApi(
        achievementsList: [
          Achievement(
            code: 'first_week',
            title: 'Неделя без опозданий',
            description: 'Пять смен подряд вовремя',
            points: 50,
            unlockedAt: DateTime(2026, 10, 3),
          ),
          const Achievement(
            code: 'hundred_calls',
            title: 'Сто звонков',
            description: 'Сто звонков за месяц',
            points: 30,
            unlockedAt: null,
          ),
        ],
      );

      await tester.pumpWidget(harness(const AchievementsScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('1 из 2'), findsOneWidget);
      // Ярлыки разделов набраны прописными.
      expect(find.text('ПОЛУЧЕНЫ'), findsOneWidget);
      expect(find.text('ЕЩЁ ВПЕРЕДИ'), findsOneWidget);
      expect(find.text('50 баллов набрано'), findsOneWidget);
    });
  });
}
