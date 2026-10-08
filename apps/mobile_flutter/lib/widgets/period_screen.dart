import 'package:flutter/material.dart';

import '../theme.dart';
import 'ui.dart';

/// Экран, который грузит данные за период и умеет обновляться жестом.
/// Четыре экрана устроены одинаково, поэтому загрузка живёт в одном месте.
class PeriodScreen<T> extends StatefulWidget {
  const PeriodScreen({
    super.key,
    required this.load,
    required this.builder,
    required this.emptyMessage,
    this.emptyIcon,
    this.isEmpty,
  });

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data) builder;
  final String emptyMessage;
  final IconData? emptyIcon;

  /// Как понять, что данных нет. Для списков — пустой список.
  final bool Function(T data)? isEmpty;

  @override
  State<PeriodScreen<T>> createState() => _PeriodScreenState<T>();
}

class _PeriodScreenState<T> extends State<PeriodScreen<T>> {
  T? _data;
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);

    try {
      final data = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = data;
        _failed = false;
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;

    if (_loading && data == null) {
      return const Center(child: CircularProgressIndicator(color: AppColors.accent));
    }

    if (_failed && data == null) {
      return ErrorRetry(message: 'Не удалось загрузить данные', onRetry: _load);
    }

    if (data == null || (widget.isEmpty?.call(data) ?? false)) {
      return RefreshIndicator(
        onRefresh: _load,
        color: AppColors.accent,
        backgroundColor: AppColors.surface,
        child: ListView(
          children: [
            SizedBox(height: gap(10)),
            EmptyState(message: widget.emptyMessage, icon: widget.emptyIcon),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
      child: widget.builder(context, data),
    );
  }
}
