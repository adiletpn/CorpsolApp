import 'package:flutter/material.dart';

/// Тёмная тема с сине-фиолетовым градиентом как подписью.
/// Фон почти чёрный, карточки чуть светлее — так градиент читается
/// как единственный яркий элемент и ведёт взгляд.
abstract final class AppColors {
  static const background = Color(0xFF07070D);
  static const surface = Color(0xFF12121C);
  static const surfaceRaised = Color(0xFF1A1A27);
  static const border = Color(0xFF23233A);

  static const text = Color(0xFFF7F7FB);
  static const textMuted = Color(0xFF8E8EA8);
  static const textFaint = Color(0xFF5C5C78);

  static const accent = Color(0xFF3B5BFF);
  static const violet = Color(0xFF7C4DFF);

  static const success = Color(0xFF2FD98B);
  static const warning = Color(0xFFFFB020);
  static const danger = Color(0xFFFF5C5C);
}

/// Фирменный градиент. Одно направление везде — иначе экраны выглядят
/// как собранные из разных приложений.
const appGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppColors.accent, AppColors.violet],
);

abstract final class AppRadius {
  static const sm = 12.0;
  static const md = 18.0;
  static const lg = 24.0;
  static const xl = 30.0;
}

/// Шаг сетки. Все отступы кратны восьми.
double gap(double units) => units * 8;

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    surface: AppColors.background,
    primary: AppColors.accent,
    onPrimary: Colors.white,
    error: AppColors.danger,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    splashFactory: InkSparkle.splashFactory,
    textTheme: const TextTheme(
      displaySmall: TextStyle(
        color: AppColors.text,
        fontSize: 34,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
        height: 1.1,
      ),
      headlineSmall: TextStyle(
        color: AppColors.text,
        fontSize: 26,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
      titleMedium: TextStyle(
        color: AppColors.text,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
      bodyMedium: TextStyle(
        color: AppColors.text,
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      bodySmall: TextStyle(color: AppColors.textMuted, fontSize: 13.5),
    ),
  );
}
