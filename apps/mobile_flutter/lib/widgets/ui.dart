import 'dart:ui';

import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// Матовое стекло: размытие фона, полупрозрачная заливка и светлая грань
/// по краю. Грань важнее заливки — именно она читается как толщина стекла.
///
/// Размытие стоит дорого, поэтому в длинных списках оно отключается
/// параметром [blur]: там хватает полупрозрачной заливки поверх пятен фона.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.radius = AppRadius.md,
    this.blur = true,
    this.highlighted = false,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final double radius;
  final bool blur;

  /// Выделенная карточка: грань ярче, видно, что строка про тебя.
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final corners = BorderRadius.circular(radius);

    Widget surface = Container(
      width: double.infinity,
      padding: padding ?? EdgeInsets.all(gap(2)),
      decoration: BoxDecoration(
        color: palette.glassFill,
        borderRadius: corners,
        border: Border.all(
          color: highlighted ? palette.accent : palette.glassBorder,
          width: highlighted ? 1.4 : 1,
        ),
        // Блик по верхней кромке: от него край выглядит скруглённым,
        // а не просто обведённым.
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            palette.glassHighlight.withValues(
              alpha: palette.glassHighlight.a * 0.22,
            ),
            palette.glassFill,
          ],
        ),
      ),
      child: child,
    );

    if (blur) {
      surface = BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: surface,
      );
    }

    final clipped = ClipRRect(borderRadius: corners, child: surface);

    if (onTap == null) return clipped;

    return InkWell(onTap: onTap, borderRadius: corners, child: clipped);
  }
}

/// Карточка списка. Стеклянная, но без размытия — строк много.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding, this.onTap});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) =>
      GlassCard(padding: padding, onTap: onTap, blur: false, child: child);
}

/// Главная карточка экрана: градиент плюс мягкое свечение под ним.
/// Используется по одной на экран — иначе перестаёт выделять главное.
class GradientCard extends StatelessWidget {
  const GradientCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      width: double.infinity,
      padding: padding ?? EdgeInsets.all(gap(2.5)),
      decoration: BoxDecoration(
        gradient: appGradient,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: [
          BoxShadow(
            color: context.palette.accent.withValues(alpha: 0.28),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );

    if (onTap == null) return body;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: body,
    );
  }
}

/// Иконка в цветной плашке. Цвет кодирует смысл строки и держит
/// списки читаемыми без лишних подписей.
class IconChip extends StatelessWidget {
  const IconChip({
    super.key,
    required this.icon,
    required this.color,
    this.size = 44,
  });

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(AppRadius.sm),
    ),
    child: Icon(icon, color: color, size: size * 0.5),
  );
}

/// Плашка статуса: опоздание, прогул, принятая сделка.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: gap(1.25), vertical: gap(0.625)),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: color,
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

/// Плитка с числом: три в ряд под главной карточкой.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.value,
    required this.label,
    required this.color,
  });

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => GlassCard(
    padding: EdgeInsets.symmetric(horizontal: gap(1.75), vertical: gap(2)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 26,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
        SizedBox(height: gap(0.375)),
        Text(
          label,
          style: TextStyle(color: context.palette.textMuted, fontSize: 12.5),
        ),
      ],
    ),
  );
}

/// Заголовок экрана.
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.displaySmall),
            if (subtitle != null) ...[
              SizedBox(height: gap(0.5)),
              Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
      if (trailing != null) trailing!,
    ],
  );
}

/// Пустое состояние вместо голого экрана, когда данных за период нет.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: EdgeInsets.all(gap(4)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconChip(
            icon: icon ?? Icons.inbox_outlined,
            color: context.palette.textFaint,
            size: 64,
          ),
          SizedBox(height: gap(2)),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.palette.textMuted, fontSize: 15),
          ),
        ],
      ),
    ),
  );
}

/// Сообщение об ошибке с повтором — у сотрудника в офисе связь рвётся.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: EdgeInsets.all(gap(4)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconChip(
            icon: Icons.cloud_off_outlined,
            color: context.palette.danger,
            size: 64,
          ),
          SizedBox(height: gap(2)),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.palette.textMuted, fontSize: 15),
          ),
          SizedBox(height: gap(2.5)),
          FilledButton(
            onPressed: onRetry,
            style: FilledButton.styleFrom(
              backgroundColor: context.palette.accent,
              padding: EdgeInsets.symmetric(
                horizontal: gap(3),
                vertical: gap(1.5),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
            ),
            child: const Text('Повторить'),
          ),
        ],
      ),
    ),
  );
}
