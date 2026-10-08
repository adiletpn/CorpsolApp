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
    required this.glassFill,
    required this.glassBorder,
    required this.glassHighlight,
    required this.ambientA,
    required this.ambientB,
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

  /// Заливка матового стекла поверх размытия. Плотная намеренно: текст
  /// должен читаться там, где под карточкой проходит цветное пятно.
  final Color glassFill;

  /// Волосяная грань стекла: светлая линия по краю даёт толщину.
  final Color glassBorder;

  /// Блик по верхней кромке — от него стекло читается выпуклым.
  final Color glassHighlight;

  /// Цветные пятна фона. Без них размывать нечего и стекло выглядит
  /// просто полупрозрачной заливкой.
  final Color ambientA;
  final Color ambientB;

  /// Тёмная. Фон не чистый чёрный, текст не чистый белый: на OLED такая
  /// пара даёт свечение вокруг букв и утомляет. Слои различаются светлотой,
  /// а не рамками. Статусные цвета — системные Apple для тёмного фона.
  static const dark = AppPalette(
    background: Color(0xFF0B0B0F),
    surface: Color(0xFF17171D),
    surfaceRaised: Color(0xFF212129),
    border: Color(0xFF2B2B35),
    text: Color(0xFFECECF1),
    textMuted: Color(0xFF9A9AAE),
    textFaint: Color(0xFF6B6B80),
    accent: Color(0xFF4C6BFF),
    violet: Color(0xFF8B5CFF),
    success: Color(0xFF30D158),
    warning: Color(0xFFFF9F0A),
    danger: Color(0xFFFF453A),
    glassFill: Color(0xE617171D),
    glassBorder: Color(0x2EFFFFFF),
    glassHighlight: Color(0x47FFFFFF),
    ambientA: Color(0xFF3B5BFF),
    ambientB: Color(0xFF7C4DFF),
  );

  /// Светлая: фон холодно-серый, карточки белые. Статусные цвета темнее
  /// тёмных — на белом иначе не хватает контраста.
  static const light = AppPalette(
    background: Color(0xFFF2F3F9),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFEBEDF6),
    border: Color(0xFFE0E4F0),
    text: Color(0xFF14151F),
    textMuted: Color(0xFF5C6180),
    textFaint: Color(0xFF9AA0BC),
    accent: Color(0xFF3B5BFF),
    violet: Color(0xFF7C4DFF),
    success: Color(0xFF12A150),
    warning: Color(0xFFC77700),
    danger: Color(0xFFE5484D),
    glassFill: Color(0xF2FFFFFF),
    glassBorder: Color(0x1F101828),
    glassHighlight: Color(0xFFFFFFFF),
    ambientA: Color(0xFF6E8BFF),
    ambientB: Color(0xFFB08BFF),
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
    Color? glassFill,
    Color? glassBorder,
    Color? glassHighlight,
    Color? ambientA,
    Color? ambientB,
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
    glassFill: glassFill ?? this.glassFill,
    glassBorder: glassBorder ?? this.glassBorder,
    glassHighlight: glassHighlight ?? this.glassHighlight,
    ambientA: ambientA ?? this.ambientA,
    ambientB: ambientB ?? this.ambientB,
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
      glassFill: Color.lerp(glassFill, other.glassFill, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      glassHighlight: Color.lerp(glassHighlight, other.glassHighlight, t)!,
      ambientA: Color.lerp(ambientA, other.ambientA, t)!,
      ambientB: Color.lerp(ambientB, other.ambientB, t)!,
    );
  }
}

/// Короткий доступ к палитре из любого виджета.
extension PaletteOf on BuildContext {
  AppPalette get palette => Theme.of(this).extension<AppPalette>()!;
}
