import 'package:flutter/material.dart';

/// Палитра повторяет веб-панель: сотрудник переходит между телефоном
/// и панелью руководителя и должен видеть одну систему, а не две разные.
abstract final class AppColors {
  static const background = Color(0xFF0F172A);
  static const surface = Color(0xFF1E293B);
  static const surfaceMuted = Color(0xFF334155);
  static const border = Color(0xFF334155);
  static const text = Color(0xFFF8FAFC);
  static const textMuted = Color(0xFF94A3B8);
  static const accent = Color(0xFF38BDF8);
  static const success = Color(0xFF34D399);
  static const warning = Color(0xFFFBBF24);
  static const danger = Color(0xFFF87171);
}

abstract final class AppRadius {
  static const sm = 8.0;
  static const md = 14.0;
  static const lg = 22.0;
}

/// Шаг сетки. Все отступы кратны восьми, как в панели.
double gap(double units) => units * 8;

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    surface: AppColors.background,
    primary: AppColors.accent,
    onPrimary: AppColors.background,
    error: AppColors.danger,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: 'Roboto',
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        color: AppColors.text,
        fontSize: 24,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: TextStyle(
        color: AppColors.text,
        fontSize: 17,
        fontWeight: FontWeight.w600,
      ),
      bodyMedium: TextStyle(color: AppColors.text, fontSize: 15),
      bodySmall: TextStyle(color: AppColors.textMuted, fontSize: 13),
    ),
  );
}
