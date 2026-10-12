import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// Главное число экрана на градиенте. Одно на экран: второе такое же
/// перестаёт быть главным.
class HeroFigure extends StatelessWidget {
  const HeroFigure({
    super.key,
    required this.label,
    required this.value,
    this.caption,
    this.icon,
    this.onTap,
  });

  final String label;
  final String value;
  final String? caption;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: EdgeInsets.all(gap(3)),
      decoration: BoxDecoration(
        gradient: appGradient,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: [
          BoxShadow(
            color: context.palette.accent.withValues(alpha: 0.3),
            blurRadius: 32,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.4,
                  ),
                ),
              ),
              if (icon != null)
                Icon(
                  icon,
                  color: Colors.white.withValues(alpha: 0.9),
                  size: 22,
                ),
            ],
          ),
          SizedBox(height: gap(1.75)),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 44,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.6,
              height: 1,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          if (caption != null) ...[
            SizedBox(height: gap(0.75)),
            Text(
              caption!,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 14,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );

    if (onTap == null) return card;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: card,
    );
  }
}

/// Ряд чисел одной группой. Разделены волосяными линиями, а не
/// превращены в три отдельные карточки — это один факт, а не три.
class FigureRow extends StatelessWidget {
  const FigureRow({super.key, required this.items});

  final List<Figure> items;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      padding: EdgeInsets.symmetric(vertical: gap(2)),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: palette.border),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < items.length; i += 1) ...[
              if (i > 0)
                VerticalDivider(width: 1, thickness: 1, color: palette.border),
              Expanded(child: items[i]),
            ],
          ],
        ),
      ),
    );
  }
}

class Figure extends StatelessWidget {
  const Figure({
    super.key,
    required this.value,
    required this.label,
    this.color,
  });

  final String value;
  final String label;

  /// Цвет даётся только значимым числам: опозданиям, прогулам.
  /// Обычные остаются цвета текста.
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: EdgeInsets.symmetric(horizontal: gap(2)),
        child: Text(
          value,
          style: TextStyle(
            color: color ?? context.palette.text,
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.6,
            height: 1,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
      SizedBox(height: gap(0.625)),
      Padding(
        padding: EdgeInsets.symmetric(horizontal: gap(2)),
        child: Text(
          label,
          style: TextStyle(color: context.palette.textMuted, fontSize: 12.5),
        ),
      ),
    ],
  );
}
