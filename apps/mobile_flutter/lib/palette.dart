import 'package:flutter/material.dart';

/// Цвета, зависящие от темы. Экраны берут их из контекста, а не из констант —
/// иначе светлая тема потребовала бы править каждый виджет.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.textFaint,
    required this.accent,
    required this.violet,
    required this.success,
    required this.warning,
    required this.danger,
  });

  final Color background;
  final Color surface;
  final Color surfaceRaised;
  final Color border;
  final Color text;
  final Color textMuted;
  final Color textFaint;
  final Color accent;
  final Color violet;
  final Color success;
  final Color warning;
  final Color danger;

  /// Тёмная: фон почти чёрный, градиент — единственное яркое пятно.
  static const dark = AppPalette(
    background: Color(0xFF07070D),
    surface: Color(0xFF12121C),
    surfaceRaised: Color(0xFF1A1A27),
    border: Color(0xFF23233A),
    text: Color(0xFFF7F7FB),
    textMuted: Color(0xFF8E8EA8),
    textFaint: Color(0xFF5C5C78),
    accent: Color(0xFF3B5BFF),
    violet: Color(0xFF7C4DFF),
    success: Color(0xFF2FD98B),
    warning: Color(0xFFFFB020),
    danger: Color(0xFFFF5C5C),
  );

  /// Светлая: фон холодно-серый, карточки белые. Статусные цвета темнее
  /// тёмных — на белом иначе не хватает контраста.
  static const light = AppPalette(
    background: Color(0xFFF5F6FB),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFEDEFF7),
    border: Color(0xFFE2E6F2),
    text: Color(0xFF0E1020),
    textMuted: Color(0xFF5C6180),
    textFaint: Color(0xFF9AA0BC),
    accent: Color(0xFF3B5BFF),
    violet: Color(0xFF7C4DFF),
    success: Color(0xFF12B76A),
    warning: Color(0xFFDC8400),
    danger: Color(0xFFE5484D),
  );

  @override
  AppPalette copyWith({
    Color? background,
    Color? surface,
    Color? surfaceRaised,
    Color? border,
    Color? text,
    Color? textMuted,
    Color? textFaint,
    Color? accent,
    Color? violet,
    Color? success,
    Color? warning,
    Color? danger,
  }) => AppPalette(
    background: background ?? this.background,
    surface: surface ?? this.surface,
    surfaceRaised: surfaceRaised ?? this.surfaceRaised,
    border: border ?? this.border,
    text: text ?? this.text,
    textMuted: textMuted ?? this.textMuted,
    textFaint: textFaint ?? this.textFaint,
    accent: accent ?? this.accent,
    violet: violet ?? this.violet,
    success: success ?? this.success,
    warning: warning ?? this.warning,
    danger: danger ?? this.danger,
  );

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other == null) return this;

    return AppPalette(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceRaised: Color.lerp(surfaceRaised, other.surfaceRaised, t)!,
      border: Color.lerp(border, other.border, t)!,
      text: Color.lerp(text, other.text, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textFaint: Color.lerp(textFaint, other.textFaint, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      violet: Color.lerp(violet, other.violet, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
    );
  }
}

/// Короткий доступ к палитре из любого виджета.
extension PaletteOf on BuildContext {
  AppPalette get palette => Theme.of(this).extension<AppPalette>()!;
}
