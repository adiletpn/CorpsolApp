import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/period_screen.dart';
import '../widgets/ui.dart';

/// То, что МОП должен видеть по ТЗ: выполнение плана отдела и свои звонки.
class WorkLoad {
  const WorkLoad({
    required this.plans,
    required this.calls,
    required this.summary,
  });

  final List<Plan> plans;
  final List<Call> calls;
  final CallsSummary summary;
}

class WorkScreen extends StatelessWidget {
  const WorkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<CorpsolApi>();
    final period = currentMonth();

    return PeriodScreen<WorkLoad>(
      title: 'Работа',
      subtitle: 'План отдела и ваши звонки за месяц',
      load: () async {
        // Три запроса параллельно: последовательно экран ждал бы втрое дольше.
        final results = await Future.wait([
          api.plans(period.from),
          api.myCalls(from: period.from, to: period.to),
          api.callsSummary(from: period.from, to: period.to),
        ]);

        return WorkLoad(
          plans: results[0] as List<Plan>,
          calls: results[1] as List<Call>,
          summary: results[2] as CallsSummary,
        );
      },
      isEmpty: (data) => data.plans.isEmpty && data.calls.isEmpty,
      emptyMessage: 'Планов и звонков за этот месяц пока нет',
      emptyIcon: Icons.insights_outlined,
      builder: (context, data) {
        final department = data.plans
            .where((plan) => plan.scope == PlanScope.department)
            .toList();
        final personal = data.plans
            .where((plan) => plan.scope == PlanScope.user)
            .toList();

        // Свежие сверху: вчерашний звонок нужен чаще, чем первый в месяце.
        final calls = [...data.calls]
          ..sort((a, b) => b.startedAt.compareTo(a.startedAt));

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CallsCard(summary: data.summary),

            if (department.isNotEmpty) ...[
              SizedBox(height: gap(3)),
              Text(
                'План отдела',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              SizedBox(height: gap(1.5)),
              for (final plan in department) ...[
                _PlanRow(progress: plan.progress),
                SizedBox(height: gap(1)),
              ],
            ],

            if (personal.isNotEmpty) ...[
              SizedBox(height: gap(2)),
              Text('Ваш план', style: Theme.of(context).textTheme.titleMedium),
              SizedBox(height: gap(1.5)),
              for (final plan in personal) ...[
                _PlanRow(progress: plan.progress),
                SizedBox(height: gap(1)),
              ],
            ],

            SizedBox(height: gap(3)),
            Text('Звонки', style: Theme.of(context).textTheme.titleMedium),
            SizedBox(height: gap(1.5)),
            if (calls.isEmpty)
              AppCard(
                child: Text(
                  'За этот месяц звонков нет',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              )
            else
              for (final call in calls.take(40)) ...[
                _CallRow(call: call),
                SizedBox(height: gap(1)),
              ],
          ],
        );
      },
    );
  }
}

class _CallsCard extends StatelessWidget {
  const _CallsCard({required this.summary});

  final CallsSummary summary;

  @override
  Widget build(BuildContext context) {
    // Доля дозвонов важнее их числа: сто звонков с десятью ответами —
    // это не работа, а гудки.
    final share = summary.total == 0
        ? 0
        : (summary.answered / summary.total * 100).round();

    return Column(
      children: [
        GradientCard(
          padding: EdgeInsets.all(gap(3)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Дозвонились',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.78),
                  fontSize: 14,
                ),
              ),
              SizedBox(height: gap(1)),
              Text(
                '$share%',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 42,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.2,
                ),
              ),
              SizedBox(height: gap(0.5)),
              Text(
                '${summary.answered} из ${summary.total} звонков',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.78),
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: gap(1.5)),
        Row(
          children: [
            Expanded(
              child: StatTile(
                value: '${summary.total}',
                label: 'всего звонков',
                color: context.palette.text,
              ),
            ),
            SizedBox(width: gap(1.25)),
            Expanded(
              child: StatTile(
                value: '${summary.talkMinutes}',
                label: 'минут разговора',
                color: context.palette.accent,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({required this.progress});

  final PlanProgress progress;

  /// Выручка приходит в тиынах, остальные метрики — штуками и минутами.
  String _format(num value) => progress.metric == PlanMetric.revenue
      ? formatMoney(value.round())
      : '${value.round()}';

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ratio = progress.ratio.clamp(0.0, 1.0);
    final color = progress.isComplete ? palette.success : palette.accent;

    return AppCard(
      padding: EdgeInsets.all(gap(2)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  planMetricLabel(progress.metric),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
              Text(
                '${(progress.ratio * 100).round()}%',
                style: TextStyle(
                  color: color,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          SizedBox(height: gap(1.25)),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: palette.surfaceRaised,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
          SizedBox(height: gap(1)),
          Text(
            progress.isComplete
                ? 'План выполнен: ${_format(progress.achieved)} из ${_format(progress.target)}'
                : '${_format(progress.achieved)} из ${_format(progress.target)}'
                      ' · осталось ${_format(progress.remaining)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  const _CallRow({required this.call});

  final Call call;

  String get _duration {
    final minutes = call.talkSeconds ~/ 60;
    final seconds = call.talkSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final answered = call.status == CallStatus.answered;
    final color = answered ? palette.success : palette.textFaint;

    return AppCard(
      padding: EdgeInsets.all(gap(1.75)),
      child: Row(
        children: [
          IconChip(
            icon: call.direction == CallDirection.inbound
                ? Icons.call_received_rounded
                : Icons.call_made_rounded,
            color: color,
          ),
          SizedBox(width: gap(1.75)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  call.clientPhone,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                SizedBox(height: gap(0.25)),
                Text(
                  '${formatDate(call.callDate)} · ${formatTime(call.startedAt)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (answered)
            Text(
              _duration,
              style: TextStyle(
                color: palette.text,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            )
          else
            StatusChip(label: callStatusLabel(call.status), color: color),
        ],
      ),
    );
  }
}
