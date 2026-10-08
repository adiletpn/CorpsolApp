import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Выбор темы. По умолчанию — как в настройках телефона: сотрудник уже
/// решил там, светлое ему или тёмное, спрашивать второй раз незачем.
class ThemeController extends ChangeNotifier {
  ThemeController(this._prefs) : _mode = _decode(_prefs?.getString(_key));

  static const _key = 'corpsol.themeMode';

  final SharedPreferences? _prefs;
  ThemeMode _mode;

  ThemeMode get mode => _mode;

  static Future<ThemeController> load() async {
    try {
      return ThemeController(await SharedPreferences.getInstance());
    } catch (_) {
      // Хранилище недоступно — тема просто не переживёт перезапуск.
      return ThemeController(null);
    }
  }

  static ThemeMode _decode(String? value) => switch (value) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  static String _encode(ThemeMode mode) => switch (mode) {
    ThemeMode.light => 'light',
    ThemeMode.dark => 'dark',
    ThemeMode.system => 'system',
  };

  Future<void> set(ThemeMode mode) async {
    if (mode == _mode) return;

    _mode = mode;
    notifyListeners();

    try {
      await _prefs?.setString(_key, _encode(mode));
    } catch (_) {
      // Не сохранилось — на текущий сеанс тема всё равно применена.
    }
  }

  /// Перебор по кругу: как в настройках, но одним нажатием.
  Future<void> cycle() => set(switch (_mode) {
    ThemeMode.system => ThemeMode.light,
    ThemeMode.light => ThemeMode.dark,
    ThemeMode.dark => ThemeMode.system,
  });

  IconData get icon => switch (_mode) {
    ThemeMode.system => Icons.brightness_auto_rounded,
    ThemeMode.light => Icons.light_mode_rounded,
    ThemeMode.dark => Icons.dark_mode_rounded,
  };

  String get label => switch (_mode) {
    ThemeMode.system => 'Как в системе',
    ThemeMode.light => 'Светлая',
    ThemeMode.dark => 'Тёмная',
  };
}
