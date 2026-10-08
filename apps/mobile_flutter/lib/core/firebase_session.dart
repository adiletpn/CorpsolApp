import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'env.dart';

/// Вход сотрудника. Firebase сам хранит сессию между запусками приложения
/// и обновляет токен заранее, поэтому ручная ротация не нужна.
class FirebaseSession {
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

  Stream<User?> get changes => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  Future<void> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email.trim(), password: password);

  Future<void> signOut() => _auth.signOut();

  /// Свежий ID-токен для запроса к бэкенду.
  Future<String?> idToken() async => _auth.currentUser?.getIdToken();
}
