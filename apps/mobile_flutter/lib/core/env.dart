/// Настройки сборки. Значения передаются через --dart-define, поэтому
/// приложение собирается под эмулятор и под облако без правки кода.
abstract final class Env {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3001/api',
  );

  // Ключи Firebase публичны по своей природе: они видны в любом клиенте.
  // Доступ ограничивают правила безопасности и проверки на бэкенде.
  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAuthDomain = String.fromEnvironment(
    'FIREBASE_AUTH_DOMAIN',
  );
  static const firebaseProjectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
  );
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');

  /// Хост эмулятора Firebase Auth для локальной разработки.
  static const authEmulatorHost = String.fromEnvironment(
    'FIREBASE_AUTH_EMULATOR_HOST',
  );

  static bool get usesAuthEmulator => authEmulatorHost.isNotEmpty;
}
