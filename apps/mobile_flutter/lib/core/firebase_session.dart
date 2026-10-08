import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'env.dart';

/// Почему не удалось войти. Отделяет неверный пароль от обрыва связи:
/// иначе сотрудник ищет ошибку в пароле, когда лежит сеть.
enum AuthFailureKind {
  wrongCredentials,
  noConnection,
  tooManyAttempts,
  disabled,
  unknown,
}

class AuthFailure implements Exception {
  const AuthFailure(this.kind, [this.rawCode]);

  final AuthFailureKind kind;

  /// Код Firebase как есть — чтобы незнакомая причина не терялась.
  final String? rawCode;

  String get message => switch (kind) {
    AuthFailureKind.wrongCredentials => 'Неверная почта или пароль',
    AuthFailureKind.noConnection =>
      'Нет связи с сервером. Проверьте интернет и повторите.',
    AuthFailureKind.tooManyAttempts =>
      'Слишком много попыток. Подождите немного и повторите.',
    AuthFailureKind.disabled => 'Учётная запись отключена. Обратитесь к ЧР.',
    AuthFailureKind.unknown =>
      'Не удалось войти${rawCode == null ? '' : ' ($rawCode)'}',
  };

  @override
  String toString() => message;
}

/// Узкий интерфейс сессии. Нужен, чтобы состояние входа и клиент API
/// не зависели от Firebase напрямую и проверялись без живого аккаунта.
abstract interface class SessionSource {
  Stream<Object?> get changes;

  Future<void> signIn(String email, String password);

  Future<void> signOut();

  Future<String?> idToken();
}

/// Вход сотрудника. Firebase сам хранит сессию между запусками приложения
/// и обновляет токен заранее, поэтому ручная ротация не нужна.
class FirebaseSession implements SessionSource {
  FirebaseSession(this._auth);

  final FirebaseAuth _auth;

  static Future<FirebaseSession> initialize() async {
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: Env.firebaseApiKey,
        authDomain: Env.firebaseAuthDomain,
        projectId: Env.firebaseProjectId,
        appId: Env.firebaseAppId,
        messagingSenderId: Env.firebaseSenderId,
      ),
    );

    final auth = FirebaseAuth.instance;

    if (Env.usesAuthEmulator) {
      final parts = Env.authEmulatorHost.split(':');
      await auth.useAuthEmulator(parts.first, int.parse(parts.last));
    }

    return FirebaseSession(auth);
  }

  @override
  Stream<User?> get changes => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  @override
  Future<void> signIn(String email, String password) async {
    try {
      await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
    } on FirebaseAuthException catch (error) {
      throw AuthFailure(_kindOf(error.code), error.code);
    }
  }

  static AuthFailureKind _kindOf(String code) => switch (code) {
    'invalid-credential' ||
    'invalid-email' ||
    'user-not-found' ||
    'wrong-password' => AuthFailureKind.wrongCredentials,
    'network-request-failed' => AuthFailureKind.noConnection,
    'too-many-requests' => AuthFailureKind.tooManyAttempts,
    'user-disabled' => AuthFailureKind.disabled,
    _ => AuthFailureKind.unknown,
  };

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  @override
  Future<String?> idToken() async => _auth.currentUser?.getIdToken();
}
