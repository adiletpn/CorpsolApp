import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/firebase_session.dart';

/// Состояние входа. Прикладной профиль приходит не из Firebase, а из нашего
/// бэкенда: именно он решает, пускать ли с этого телефона.
class AuthController extends ChangeNotifier {
  AuthController(this._session, this._api) {
    // Firebase восстанавливает сессию из хранилища сам, поэтому подписка
    // срабатывает и при холодном старте приложения.
    _subscription = _session.changes.listen(_onFirebaseUserChanged);
  }

  final SessionSource _session;
  final CorpsolApi _api;
  late final StreamSubscription<dynamic> _subscription;

  AuthUser? _user;
  bool _initializing = true;

  AuthUser? get user => _user;
  bool get initializing => _initializing;
  bool get isSignedIn => _user != null;

  Future<void> _onFirebaseUserChanged(dynamic firebaseUser) async {
    if (firebaseUser == null) {
      _set(user: null, initializing: false);
      return;
    }

    try {
      _set(user: await _api.openSession(), initializing: false);
    } catch (_) {
      // Устройство откреплено или сотрудник уволен — держать
      // авторизацию Firebase в этом случае незачем.
      await _session.signOut().catchError((_) {});
      _set(user: null, initializing: false);
    }
  }

  Future<void> signIn(String email, String password) async {
    await _session.signIn(email.toLowerCase(), password);

    try {
      _set(user: await _api.openSession(), initializing: false);
    } on ApiError {
      // Firebase уже пустил в аккаунт, но телефон не тот. Выходим,
      // иначе приложение осталось бы в подвешенном состоянии.
      await _session.signOut().catchError((_) {});
      rethrow;
    }
  }

  /// Письмо со ссылкой на смену пароля. Вход при этом не происходит.
  Future<void> sendPasswordReset(String email) =>
      _session.sendPasswordReset(email);

  Future<void> signOut() async {
    await _api.closeSession().catchError((_) {});
    await _session.signOut();
    _set(user: null, initializing: false);
  }

  void _set({required AuthUser? user, required bool initializing}) {
    _user = user;
    _initializing = initializing;
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
