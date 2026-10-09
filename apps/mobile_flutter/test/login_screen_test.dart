import 'package:corpsol_mobile/api/client.dart';
import 'package:corpsol_mobile/core/firebase_session.dart';
import 'package:corpsol_mobile/screens/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Future<void> fillAndSubmit(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).first, 'mop1@corpsol.kz');
  await tester.enterText(find.byType(TextField).last, 'CorpSol2026!');
  await tester.tap(find.text('Войти'));
  await tester.pumpAndSettle();
}

void main() {
  group('вход: причина отказа', () {
    testWidgets('обрыв связи не выдаётся за неверный пароль', (tester) async {
      final session = FakeSession()
        ..signInFailure = const AuthFailure(AuthFailureKind.noConnection);

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await fillAndSubmit(tester);

      expect(find.textContaining('Нет связи с сервером'), findsOneWidget);
      expect(find.textContaining('Неверная почта'), findsNothing);
    });

    testWidgets('неверный пароль так и называется', (tester) async {
      final session = FakeSession()
        ..signInFailure = const AuthFailure(AuthFailureKind.wrongCredentials);

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await fillAndSubmit(tester);

      expect(find.text('Неверная почта или пароль'), findsOneWidget);
    });

    testWidgets('отключённая учётка отправляет к ЧР', (tester) async {
      final session = FakeSession()
        ..signInFailure = const AuthFailure(AuthFailureKind.disabled);

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await fillAndSubmit(tester);

      expect(find.textContaining('Обратитесь к ЧР'), findsOneWidget);
    });

    testWidgets('незнакомый код Firebase показывается, а не прячется', (
      tester,
    ) async {
      final session = FakeSession()
        ..signInFailure = const AuthFailure(
          AuthFailureKind.unknown,
          'operation-not-allowed',
        );

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await fillAndSubmit(tester);

      expect(find.textContaining('operation-not-allowed'), findsOneWidget);
    });
  });

  group('вход: отказ по устройству', () {
    testWidgets('чужой телефон объясняется словами сотрудника', (tester) async {
      final api = FakeApi(
        failWith: const ApiError(409, 'device_taken', 'занято'),
      );

      await tester.pumpWidget(
        harness(const LoginScreen(), api: api, signedIn: false),
      );
      await fillAndSubmit(tester);

      expect(
        find.text('Этот телефон уже закреплён за другим сотрудником.'),
        findsOneWidget,
      );
    });
  });

  group('вход: забытый пароль', () {
    testWidgets('без почты просит её ввести, а письмо не шлёт', (tester) async {
      final session = FakeSession();

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await tester.tap(find.text('Забыли пароль?'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Введите рабочую почту'), findsOneWidget);
      expect(session.resetSentTo, isEmpty);
    });

    testWidgets('письмо уходит на введённый адрес', (tester) async {
      final session = FakeSession();

      await tester.pumpWidget(
        harness(const LoginScreen(), session: session, signedIn: false),
      );
      await tester.enterText(find.byType(TextField).first, ' mop1@corpsol.kz ');
      await tester.tap(find.text('Забыли пароль?'));
      await tester.pumpAndSettle();

      expect(session.resetSentTo, ['mop1@corpsol.kz']);
    });

    testWidgets('ответ не подтверждает, заведена ли такая почта', (
      tester,
    ) async {
      await tester.pumpWidget(harness(const LoginScreen(), signedIn: false));
      await tester.enterText(
        find.byType(TextField).first,
        'кого-нет@corpsol.kz',
      );
      await tester.tap(find.text('Забыли пароль?'));
      await tester.pumpAndSettle();

      // Формулировка одна на любой адрес — иначе перебором узнают сотрудников.
      expect(
        find.text('Если такая почта заведена, письмо уже отправлено'),
        findsOneWidget,
      );
    });
  });
}
