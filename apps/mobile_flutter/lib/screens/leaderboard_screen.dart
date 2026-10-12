import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/figures.dart';
import '../widgets/list.dart';
import '../widgets/period_screen.dart';

class LeaderboardScreen extends StatelessWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<CorpsolApi>();
    final period = currentMonth();
    final selfId = context.watch<AuthController>().user?.id;

    return PeriodScreen<LeaderboardResult>(
      title: 'Рейтинг',
      subtitle: 'Баллы отдела за месяц',
      load: () => api.leaderboard(from: period.from, to: period.to),
      isEmpty: (data) => data.entries.isEmpty,
      emptyMessage: 'За этот месяц баллов ещё никто не набрал',
      emptyIcon: Icons.leaderboard_outlined,
      builder: (context, board) {
        final self = board.self;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (self != null) ...[
              HeroFigure(
                label: 'Ваше место',
                value: '${self.rank}',
                caption: self.pointsBehindLeader == 0
                    ? '${self.points} баллов — вы впереди всех'
                    : '${self.points} баллов · до первого места '
                          '${self.pointsBehindLeader}',
                icon: Icons.leaderboard_outlined,
              ),
              SizedBox(height: gap(3.5)),
            ],
            const SectionLabel('Отдел за месяц'),
            Panel(
              children: [
                for (final entry in board.entries)
                  _entryRow(context, entry, entry.userId == selfId),
              ],
            ),
            SizedBox(height: gap(2)),
          ],
        );
      },
    );
  }
}

/// Строка рейтинга. Первая тройка помечена медальным цветом,
/// своя строка — акцентом: её ищут глазами первой.
Widget _entryRow(BuildContext context, RankedEntry entry, bool isSelf) {
  final palette = context.palette;

  final medal = switch (entry.rank) {
    1 => const Color(0xFFFFC53D),
    2 => const Color(0xFFA8AEBF),
    3 => const Color(0xFFCD7F32),
    _ => null,
  };

  return PanelRow(
    title: isSelf ? '${entry.fullName} · вы' : entry.fullName,
    subtitle: medal != null ? '${entry.rank} место' : null,
    accent: isSelf ? palette.accent : medal,
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (medal == null && !isSelf)
          SizedBox(
            width: 28,
            child: Text(
              '${entry.rank}',
              style: TextStyle(
                color: palette.textFaint,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        RowValue('${entry.points}', color: isSelf ? palette.accent : null),
      ],
    ),
  );
}
