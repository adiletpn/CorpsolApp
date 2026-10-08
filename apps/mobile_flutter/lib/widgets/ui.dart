import 'package:flutter/material.dart';

import '../theme.dart';

/// Карточка — основной контейнер на всех экранах.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: padding ?? EdgeInsets.all(gap(2)),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.md),
      border: Border.all(color: AppColors.border),
    ),
    child: child,
  );
}

/// Цветная плашка статуса: опоздание, прогул, принятый оффер.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: gap(1.25), vertical: gap(0.5)),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(AppRadius.sm),
    ),
    child: Text(
      label,
      style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600),
    ),
  );
}

/// Заголовок с подписью — шапка каждого экрана.
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: Theme.of(context).textTheme.headlineSmall),
      if (subtitle != null) ...[
        SizedBox(height: gap(0.5)),
        Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
      ],
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
            color: AppColors.textMuted,
            size: 44,
          ),
          SizedBox(height: gap(1.5)),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 15),
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
          const Icon(
            Icons.cloud_off_outlined,
            color: AppColors.danger,
            size: 44,
          ),
          SizedBox(height: gap(1.5)),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 15),
          ),
          SizedBox(height: gap(2)),
          FilledButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    ),
  );
}
