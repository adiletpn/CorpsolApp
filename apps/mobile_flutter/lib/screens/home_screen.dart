import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
import '../palette.dart';
import '../theme.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
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

    final checkedInToday = _records.any(
      (record) => record.checkInAt != null && record.workDate == today,
    );

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
          SizedBox(height: gap(2.5)),
          _CheckInCard(done: checkedInToday, onScan: widget.onScan),
          SizedBox(height: gap(2.5)),
          _MonthSummary(records: _records),
          SizedBox(height: gap(2.5)),
          Text(
            'Табель за месяц',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          SizedBox(height: gap(1.5)),
          if (_failed && _records.isEmpty)
            ErrorRetry(message: 'Не удалось загрузить табель', onRetry: _load)
          else if (_loading && _records.isEmpty)
            Center(
              child: CircularProgressIndicator(color: context.palette.accent),
            )
          else if (sorted.isEmpty)
            const EmptyState(message: 'За этот месяц отметок пока нет')
          else
            for (final record in sorted) ...[
              _AttendanceRow(record: record),
              SizedBox(height: gap(1)),
            ],
        ],
      ),
    );
  }
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
  const _CheckInCard({required this.done, required this.onScan});

  final bool done;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    // Отмеченный день не зовёт нажимать — градиент уходит, остаётся карточка.
    if (done) {
      return AppCard(
        padding: EdgeInsets.all(gap(2.5)),
        child: Row(
          children: [
            IconChip(
              icon: Icons.check_rounded,
              color: context.palette.success,
              size: 52,
            ),
            SizedBox(width: gap(2)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Приход отмечен',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  SizedBox(height: gap(0.375)),
                  Text(
                    'На сегодня всё, хорошего дня',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
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
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: StatTile(
          value: '${_count(AttendanceStatus.onTime)}',
          label: 'вовремя',
          color: context.palette.success,
        ),
      ),
      SizedBox(width: gap(1.25)),
      Expanded(
        child: StatTile(
          value: '${_count(AttendanceStatus.late)}',
          label: 'опозданий',
          color: context.palette.warning,
        ),
      ),
      SizedBox(width: gap(1.25)),
      Expanded(
        child: StatTile(
          value: '${_count(AttendanceStatus.absent)}',
          label: 'прогулов',
          color: context.palette.danger,
        ),
      ),
    ],
  );
}

class _AttendanceRow extends StatelessWidget {
  const _AttendanceRow({required this.record});

  final AttendanceRecord record;

  /// Иконка повторяет статус: день виден до чтения подписи.
  IconData get _icon => switch (record.status) {
    AttendanceStatus.onTime => Icons.check_rounded,
    AttendanceStatus.late => Icons.schedule_rounded,
    AttendanceStatus.absent => Icons.close_rounded,
    AttendanceStatus.dayOff => Icons.weekend_outlined,
    AttendanceStatus.excused => Icons.event_available_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final checkIn = record.checkInAt;
    final color = attendanceStatusColor(record.status, context.palette);

    return AppCard(
      padding: EdgeInsets.all(gap(1.75)),
      child: Row(
        children: [
          IconChip(icon: _icon, color: color),
          SizedBox(width: gap(1.75)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatDate(record.workDate),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                SizedBox(height: gap(0.25)),
                Text(
                  checkIn == null
                      ? 'Без отметки${attendanceMethodNote(record.method)}'
                      : '${formatTime(checkIn)}${attendanceMethodNote(record.method)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          StatusChip(
            label:
                record.status == AttendanceStatus.late && record.lateMinutes > 0
                ? '+${record.lateMinutes} мин'
                : attendanceStatusLabel(record.status),
            color: color,
          ),
        ],
      ),
    );
  }
}
