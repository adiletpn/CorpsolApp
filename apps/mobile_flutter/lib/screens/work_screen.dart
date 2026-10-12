import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/figures.dart';
import '../widgets/list.dart';
import '../widgets/period_screen.dart';

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
      // Сводка по звонкам — тоже содержимое: список может быть пуст,
      // когда звонки есть, но запрос за ними не вернул страницу.
      isEmpty: (data) =>
          data.plans.isEmpty && data.calls.isEmpty && data.summary.total == 0,
      emptyMessage: 'Планов и звонков за этот месяц пока нет',
      emptyIcon: Icons.insights_outlined,
      builder: (context, data) {
        final summary = data.summary;

        // Доля дозвонов важнее их числа: сто звонков с десятью ответами —
        // это не работа, а гудки.
        final share = summary.total == 0
            ? 0
            : (summary.answered / summary.total * 100).round();

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
            HeroFigure(
              label: 'Дозвонились',
              value: '$share%',
              caption: '${summary.answered} из ${summary.total} звонков',
              icon: Icons.call_outlined,
            ),
            SizedBox(height: gap(1.5)),
            FigureRow(
              items: [
                Figure(value: '${summary.total}', label: 'всего звонков'),
                Figure(
                  value: '${summary.talkMinutes}',
                  label: 'минут разговора',
                ),
              ],
            ),

            if (department.isNotEmpty) ...[
              SizedBox(height: gap(3.5)),
              const SectionLabel('План отдела'),
              Panel(
                children: [
                  for (final plan in department)
                    _planRow(context, plan.progress),
                ],
              ),
            ],

            if (personal.isNotEmpty) ...[
              SizedBox(height: gap(3)),
              const SectionLabel('Ваш план'),
              Panel(
                children: [
                  for (final plan in personal) _planRow(context, plan.progress),
                ],
              ),
            ],

            SizedBox(height: gap(3.5)),
            const SectionLabel('Звонки'),
            if (calls.isEmpty)
              Panel(
                children: [
                  PanelRow(
                    title: 'За этот месяц звонков нет',
                    trailing: RowValue('—', muted: true),
                  ),
                ],
              )
            else
              Panel(
                children: [
                  for (final call in calls.take(40)) _callRow(context, call),
                ],
              ),
            SizedBox(height: gap(2)),
          ],
        );
      },
    );
  }
}

/// Строка плана: полоса выполнения занимает всю ширину под текстом,
/// поэтому вынесена из обычной строки в собственную разметку.
Widget _planRow(BuildContext context, PlanProgress progress) {
  final palette = context.palette;
  final ratio = progress.ratio.clamp(0.0, 1.0);
  final color = progress.isComplete ? palette.success : palette.accent;

  String format(num value) => progress.metric == PlanMetric.revenue
      ? formatMoney(value.round())
      : '${value.round()}';

  return Padding(
    padding: EdgeInsets.symmetric(horizontal: gap(2), vertical: gap(1.75)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                planMetricLabel(progress.metric),
                style: TextStyle(
                  color: palette.text,
                  fontSize: 15.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            RowValue('${(progress.ratio * 100).round()}%', color: color),
          ],
        ),
        SizedBox(height: gap(1.25)),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 6,
            backgroundColor: palette.surfaceRaised,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
        SizedBox(height: gap(1)),
        Text(
          progress.isComplete
              ? 'Выполнен: ${format(progress.achieved)} из ${format(progress.target)}'
              : '${format(progress.achieved)} из ${format(progress.target)}'
                    ' · осталось ${format(progress.remaining)}',
          style: TextStyle(color: palette.textMuted, fontSize: 13),
        ),
      ],
    ),
  );
}

/// Строка звонка. Засечка только у недозвонов — отвеченный звонок
/// это норма, и подсвечивать её незачем.
Widget _callRow(BuildContext context, Call call) {
  final palette = context.palette;
  final answered = call.status == CallStatus.answered;

  final minutes = call.talkSeconds ~/ 60;
  final seconds = call.talkSeconds % 60;

  return PanelRow(
    title: call.clientPhone,
    subtitle:
        '${formatDate(call.callDate)} · ${formatTime(call.startedAt)}'
        '${call.direction == CallDirection.inbound ? ' · входящий' : ''}',
    accent: answered ? null : palette.textFaint,
    trailing: answered
        ? RowValue('$minutes:${seconds.toString().padLeft(2, '0')}')
        : RowValue(callStatusLabel(call.status), muted: true),
  );
}
