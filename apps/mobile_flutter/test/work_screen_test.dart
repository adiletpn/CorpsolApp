import 'package:corpsol_mobile/api/models.dart';
import 'package:corpsol_mobile/screens/work_screen.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Plan plan({
  required PlanScope scope,
  required PlanMetric metric,
  required num target,
  required num achieved,
}) => Plan(
  id: 'plan-${metric.name}-${scope.name}',
  scope: scope,
  progress: PlanProgress(
    metric: metric,
    target: target,
    achieved: achieved,
    ratio: achieved / target,
    remaining: target - achieved > 0 ? target - achieved : 0,
    isComplete: achieved >= target,
  ),
);

Call call({
  required String phone,
  CallStatus status = CallStatus.answered,
  int talkSeconds = 95,
}) => Call(
  id: 'call-$phone',
  direction: CallDirection.outbound,
  status: status,
  clientPhone: phone,
  callDate: '2026-10-08',
  startedAt: DateTime(2026, 10, 8, 11, 20),
  durationSeconds: talkSeconds + 12,
  talkSeconds: talkSeconds,
);

void main() {
  setUpAll(initLocale);

  group('работа: план отдела', () {
    testWidgets('показывает выполнение плана отдела — это требование ТЗ', (
      tester,
    ) async {
      final api = FakeApi(
        plansList: [
          plan(
            scope: PlanScope.department,
            metric: PlanMetric.calls,
            target: 1000,
            achieved: 640,
          ),
        ],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('План отдела'), findsOneWidget);
      expect(find.text('Звонки'), findsWidgets);
      expect(find.text('64%'), findsOneWidget);
      expect(find.textContaining('640 из 1000'), findsOneWidget);
    });

    testWidgets('личный план отделён от отдельского', (tester) async {
      final api = FakeApi(
        plansList: [
          plan(
            scope: PlanScope.department,
            metric: PlanMetric.calls,
            target: 1000,
            achieved: 500,
          ),
          plan(
            scope: PlanScope.user,
            metric: PlanMetric.offers,
            target: 10,
            achieved: 10,
          ),
        ],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('План отдела'), findsOneWidget);
      expect(find.text('Ваш план'), findsOneWidget);
      expect(find.textContaining('План выполнен'), findsOneWidget);
    });

    testWidgets('выручка показывается деньгами, а не числом', (tester) async {
      final api = FakeApi(
        plansList: [
          plan(
            scope: PlanScope.department,
            metric: PlanMetric.revenue,
            target: 100000000,
            achieved: 45000000,
          ),
        ],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.textContaining('450 000 ₸'), findsOneWidget);
    });
  });

  group('работа: свои звонки', () {
    testWidgets('доля дозвонов важнее их числа', (tester) async {
      final api = FakeApi(
        callsSummaryResult: const CallsSummary(
          total: 80,
          answered: 60,
          talkMinutes: 143,
        ),
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('75%'), findsOneWidget);
      expect(find.text('60 из 80 звонков'), findsOneWidget);
      expect(find.text('143'), findsOneWidget);
    });

    testWidgets('без звонков доля не делит на ноль', (tester) async {
      final api = FakeApi(
        callsSummaryResult: const CallsSummary(
          total: 0,
          answered: 0,
          talkMinutes: 0,
        ),
        plansList: [
          plan(
            scope: PlanScope.department,
            metric: PlanMetric.calls,
            target: 100,
            achieved: 0,
          ),
        ],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('0%'), findsWidgets);
    });

    testWidgets('у отвеченного звонка видно время разговора', (tester) async {
      final api = FakeApi(
        callsList: [call(phone: '+7 701 000 11 22', talkSeconds: 95)],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('+7 701 000 11 22'), findsOneWidget);
      expect(find.text('1:35'), findsOneWidget);
    });

    testWidgets('неотвеченный звонок помечен, а не показан пустым', (
      tester,
    ) async {
      final api = FakeApi(
        callsList: [
          call(
            phone: '+7 701 000 33 44',
            status: CallStatus.noAnswer,
            talkSeconds: 0,
          ),
        ],
      );

      await tester.pumpWidget(harness(const WorkScreen(), api: api));
      await tester.pumpAndSettle();

      expect(find.text('Не ответили'), findsOneWidget);
    });
  });
}
