import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
import '../state/theme_controller.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/figures.dart';
import '../widgets/list.dart';
import '../widgets/ui.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onScan});

  final VoidCallback onScan;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<AttendanceRecord> _records = const [];
  bool _loading = true;
  bool _failed = false;
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Отметка ухода. Сервер сам находит сегодняшнюю смену.
  Future<void> _checkOut() async {
    if (_leaving) return;
    setState(() => _leaving = true);

    final messenger = ScaffoldMessenger.maybeOf(context);

    try {
      await context.read<CorpsolApi>().checkOut();
      await _load();
    } on ApiError catch (error) {
      messenger?.showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      messenger?.showSnackBar(
        const SnackBar(
          content: Text('Нет связи с сервером. Попробуйте ещё раз.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);

    try {
      final period = currentMonth();
      final data = await context.read<CorpsolApi>().myAttendance(
        from: period.from,
        to: period.to,
      );
      if (!mounted) return;
      setState(() {
        _records = data;
        _failed = false;
      });
    } catch (_) {
      // Прошлые данные оставляем — экран не должен падать из-за сети, —
      // но отмечаем сбой: иначе пустой табель прочитается как «отметок нет».
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final today = dateKey(DateTime.now());

    final todayRecord = _records
        .where((record) => record.workDate == today)
        .firstOrNull;
    final checkedInToday = todayRecord?.checkInAt != null;

    // Свежие смены сверху: вчерашний день нужен чаще, чем первое число месяца.
    final sorted = [..._records]
      ..sort((a, b) => b.workDate.compareTo(a.workDate));

    return RefreshIndicator(
      onRefresh: _load,
      color: context.palette.accent,
      backgroundColor: context.palette.surface,
      child: ListView(
        padding: EdgeInsets.all(gap(2)),
        children: [
          _Header(fullName: user?.fullName ?? ''),
          SizedBox(height: gap(3)),
          _CheckInCard(
            done: checkedInToday,
            leftAt: todayRecord?.checkOutAt,
            busy: _leaving,
            onScan: widget.onScan,
            onCheckOut: _checkOut,
          ),
          SizedBox(height: gap(1.5)),
          _MonthSummary(records: _records),
          SizedBox(height: gap(3.5)),
          const SectionLabel('Табель за месяц'),
          if (_failed && _records.isEmpty)
            ErrorRetry(message: 'Не удалось загрузить табель', onRetry: _load)
          else if (_loading && _records.isEmpty)
            Padding(
              padding: EdgeInsets.only(top: gap(4)),
              child: Center(
                child: CircularProgressIndicator(color: context.palette.accent),
              ),
            )
          else if (sorted.isEmpty)
            const EmptyState(message: 'За этот месяц отметок пока нет')
          else
            Panel(
              children: [
                for (final record in sorted) _attendanceRow(context, record),
              ],
            ),
          SizedBox(height: gap(2)),
        ],
      ),
    );
  }
}

/// Строка табеля. Цветная засечка и подпись статуса появляются только
/// у отклонений: обычная смена говорит сама за себя временем прихода.
Widget _attendanceRow(BuildContext context, AttendanceRecord record) {
  final palette = context.palette;
  final checkIn = record.checkInAt;
  final normal = record.status == AttendanceStatus.onTime;
  final color = attendanceStatusColor(record.status, palette);

  final note = switch (record.status) {
    AttendanceStatus.late => 'Опоздание ${record.lateMinutes} мин',
    AttendanceStatus.absent => 'Не отмечался',
    AttendanceStatus.dayOff => 'Выходной',
    AttendanceStatus.excused => 'Уважительная',
    AttendanceStatus.notCounted => 'Мало дозвонов',
    AttendanceStatus.onTime =>
      record.checkOutAt == null ? null : 'до ${formatTime(record.checkOutAt!)}',
  };

  return PanelRow(
    title: formatDate(record.workDate),
    subtitle: note,
    accent: normal ? null : color,
    trailing: checkIn == null
        ? RowValue('—', muted: true)
        : RowValue(formatTime(checkIn), color: normal ? null : color),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.fullName});

  final String fullName;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: ScreenHeader(
          title: fullName,
          subtitle: 'Менеджер отдела продаж',
        ),
      ),
      // Переключатель темы: светлая, тёмная, как в системе.
      IconButton(
        tooltip: context.watch<ThemeController>().label,
        onPressed: () => context.read<ThemeController>().cycle(),
        icon: Icon(
          context.watch<ThemeController>().icon,
          color: context.palette.textMuted,
          size: 22,
        ),
      ),
      TextButton(
        onPressed: () => context.read<AuthController>().signOut(),
        child: Text(
          'Выйти',
          style: TextStyle(color: context.palette.textMuted),
        ),
      ),
    ],
  );
}

class _CheckInCard extends StatelessWidget {
  const _CheckInCard({
    required this.done,
    required this.leftAt,
    required this.busy,
    required this.onScan,
    required this.onCheckOut,
  });

  final bool done;

  /// Время ухода, если смена уже закрыта.
  final DateTime? leftAt;
  final bool busy;
  final VoidCallback onScan;
  final VoidCallback onCheckOut;

  @override
  Widget build(BuildContext context) {
    // Отмеченный день не зовёт нажимать: градиент уходит, остаётся
    // спокойная панель со временем и кнопкой ухода.
    if (done) {
      final palette = context.palette;

      return Panel(
        children: [
          PanelRow(
            title: 'Приход отмечен',
            subtitle: leftAt == null
                ? 'Не забудьте отметить уход'
                : 'Ушли в ${formatTime(leftAt!)}. Хорошего вечера',
            accent: palette.success,
            trailing: leftAt != null
                ? Icon(Icons.check_rounded, color: palette.success, size: 22)
                : FilledButton(
                    onPressed: busy ? null : onCheckOut,
                    style: FilledButton.styleFrom(
                      backgroundColor: palette.surfaceRaised,
                      foregroundColor: palette.text,
                      padding: EdgeInsets.symmetric(
                        horizontal: gap(2),
                        vertical: gap(1.25),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                      ),
                    ),
                    child: busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Ухожу'),
                  ),
          ),
        ],
      );
    }

    return GradientCard(
      onTap: onScan,
      padding: EdgeInsets.all(gap(3)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: const Icon(
                  Icons.qr_code_scanner_rounded,
                  color: Colors.white,
                  size: 28,
                ),
              ),
              SizedBox(width: gap(2)),
              const Expanded(
                child: Text(
                  'Отметить приход',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              const Icon(
                Icons.arrow_forward_rounded,
                color: Colors.white,
                size: 22,
              ),
            ],
          ),
          SizedBox(height: gap(1.75)),
          Text(
            'Отсканируйте QR-код на терминале в офисе',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.82),
              fontSize: 14.5,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _MonthSummary extends StatelessWidget {
  const _MonthSummary({required this.records});

  final List<AttendanceRecord> records;

  int _count(AttendanceStatus status) =>
      records.where((record) => record.status == status).length;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final late = _count(AttendanceStatus.late);
    // Не засчитанный по дозвонам день в расчёте идёт как прогул.
    final absent =
        _count(AttendanceStatus.absent) + _count(AttendanceStatus.notCounted);

    return FigureRow(
      items: [
        Figure(value: '${_count(AttendanceStatus.onTime)}', label: 'вовремя'),
        // Цветом помечаем только то, что требует внимания.
        Figure(
          value: '$late',
          label: 'опозданий',
          color: late > 0 ? palette.warning : null,
        ),
        Figure(
          value: '$absent',
          label: 'прогулов',
          color: absent > 0 ? palette.danger : null,
        ),
      ],
    );
  }
}
