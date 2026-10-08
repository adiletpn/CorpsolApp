import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'env.dart';

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
  Future<void> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email.trim(), password: password);

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  @override
  Future<String?> idToken() async => _auth.currentUser?.getIdToken();
}
