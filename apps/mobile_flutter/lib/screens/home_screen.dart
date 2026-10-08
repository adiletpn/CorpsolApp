import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
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
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
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
            const Center(
              child: CircularProgressIndicator(color: AppColors.accent),
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
        child: const Text(
          'Выйти',
          style: TextStyle(color: AppColors.textMuted),
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
    return InkWell(
      onTap: done ? null : onScan,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.all(gap(3)),
        decoration: BoxDecoration(
          color: done ? AppColors.surface : AppColors.accent,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: done ? AppColors.border : AppColors.accent),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  done ? Icons.check_circle_outline : Icons.qr_code_scanner,
                  color: done ? AppColors.success : AppColors.background,
                  size: 26,
                ),
                SizedBox(width: gap(1.5)),
                Text(
                  done ? 'Приход отмечен' : 'Отметить приход',
                  style: TextStyle(
                    color: done ? AppColors.text : AppColors.background,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            SizedBox(height: gap(1)),
            Text(
              done
                  ? 'На сегодня всё, хорошего дня'
                  : 'Отсканируйте QR-код на терминале в офисе',
              style: TextStyle(
                color: done ? AppColors.textMuted : AppColors.background,
                fontSize: 14,
              ),
            ),
          ],
        ),
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
        child: _Tile(
          value: _count(AttendanceStatus.onTime),
          label: 'вовремя',
          color: AppColors.success,
        ),
      ),
      SizedBox(width: gap(1.5)),
      Expanded(
        child: _Tile(
          value: _count(AttendanceStatus.late),
          label: 'опозданий',
          color: AppColors.warning,
        ),
      ),
      SizedBox(width: gap(1.5)),
      Expanded(
        child: _Tile(
          value: _count(AttendanceStatus.absent),
          label: 'прогулов',
          color: AppColors.danger,
        ),
      ),
    ],
  );
}

class _Tile extends StatelessWidget {
  const _Tile({required this.value, required this.label, required this.color});

  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$value',
          style: TextStyle(
            color: color,
            fontSize: 28,
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: gap(0.25)),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );
}

class _AttendanceRow extends StatelessWidget {
  const _AttendanceRow({required this.record});

  final AttendanceRecord record;

  @override
  Widget build(BuildContext context) {
    final checkIn = record.checkInAt;

    return AppCard(
      child: Row(
        children: [
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
                ? '${attendanceStatusLabel(record.status)} ${record.lateMinutes} мин'
                : attendanceStatusLabel(record.status),
            color: attendanceStatusColor(record.status),
          ),
        ],
      ),
    );
  }
}
