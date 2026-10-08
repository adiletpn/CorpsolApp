import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'api/client.dart';
import 'api/endpoints.dart';
import 'core/firebase_session.dart';
import 'screens/login_screen.dart';
import 'shell.dart';
import 'state/auth_controller.dart';
import 'state/theme_controller.dart';
import 'palette.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Даты и суммы показываются по-русски, формат задаётся один раз.
  await initializeDateFormatting('ru');

  final session = await FirebaseSession.initialize();
  final api = CorpsolApi(ApiClient(session));
  final theme = await ThemeController.load();

  runApp(CorpsolApp(session: session, api: api, theme: theme));
}

class CorpsolApp extends StatelessWidget {
  const CorpsolApp({
    super.key,
    required this.session,
    required this.api,
    this.theme,
  });

  final FirebaseSession session;
  final CorpsolApi api;

  /// Тема может не передаваться в тестах — тогда берётся системная.
  final ThemeController? theme;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<CorpsolApi>.value(value: api),
        ChangeNotifierProvider(create: (_) => AuthController(session, api)),
        ChangeNotifierProvider<ThemeController>.value(
          value: theme ?? ThemeController(null),
        ),
      ],
      child: Consumer<ThemeController>(
        builder: (context, themeController, _) => MaterialApp(
          title: 'CorpSol',
          debugShowCheckedModeBanner: false,
          theme: buildLightTheme(),
          darkTheme: buildDarkTheme(),
          themeMode: themeController.mode,
          home: const _Root(),
        ),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    // Firebase восстанавливает сессию из хранилища, и пока он этого не сделал,
    // показывать экран входа нельзя — он мигнул бы у вошедшего сотрудника.
    if (auth.initializing) {
      return Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: context.palette.accent),
        ),
      );
    }

    return auth.isSignedIn ? const AppShell() : const LoginScreen();
  }
}
