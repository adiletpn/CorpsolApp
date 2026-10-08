import 'package:flutter/material.dart';

import 'palette.dart';

/// Фирменный градиент. Один и тот же в обеих темах: он и есть подпись,
/// по нему приложение узнаётся независимо от фона.
const appGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF3B5BFF), Color(0xFF7C4DFF)],
);

abstract final class AppRadius {
  static const sm = 12.0;
  static const md = 18.0;
  static const lg = 24.0;
  static const xl = 30.0;
}

/// Шаг сетки. Все отступы кратны восьми.
double gap(double units) => units * 8;

TextTheme _textTheme(AppPalette palette) => TextTheme(
  displaySmall: TextStyle(
    color: palette.text,
    fontSize: 34,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.8,
    height: 1.1,
  ),
  headlineSmall: TextStyle(
    color: palette.text,
    fontSize: 26,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.4,
  ),
  titleMedium: TextStyle(
    color: palette.text,
    fontSize: 18,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
  ),
  bodyMedium: TextStyle(
    color: palette.text,
    fontSize: 15,
    fontWeight: FontWeight.w500,
  ),
  bodySmall: TextStyle(color: palette.textMuted, fontSize: 13.5),
);

ThemeData _build(AppPalette palette, Brightness brightness) => ThemeData(
  useMaterial3: true,
  brightness: brightness,
  colorScheme: ColorScheme.fromSeed(
    seedColor: palette.accent,
    brightness: brightness,
    surface: palette.background,
    primary: palette.accent,
    onPrimary: Colors.white,
    error: palette.danger,
  ),
  scaffoldBackgroundColor: palette.background,
  splashFactory: InkSparkle.splashFactory,
  textTheme: _textTheme(palette),
  extensions: [palette],
);

ThemeData buildDarkTheme() => _build(AppPalette.dark, Brightness.dark);

ThemeData buildLightTheme() => _build(AppPalette.light, Brightness.light);

/// Оставлено для кода и тестов, которые просят тему без уточнения.
ThemeData buildTheme() => buildDarkTheme();
