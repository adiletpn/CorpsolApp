import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// Матовое стекло: размытие фона, полупрозрачная заливка и светлая грань
/// по краю. Грань важнее заливки — именно она читается как толщина стекла.
///
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
          Icon(
            icon ?? Icons.inbox_outlined,
            color: context.palette.textFaint,
            size: 40,
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
          Icon(
            Icons.cloud_off_outlined,
            color: context.palette.danger,
            size: 40,
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
