import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/figures.dart';
import '../widgets/list.dart';
import '../widgets/period_screen.dart';

class AchievementsScreen extends StatelessWidget {
  const AchievementsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<CorpsolApi>();

    return PeriodScreen<List<Achievement>>(
      title: 'Награды',
      subtitle: 'Полученные и то, к чему можно стремиться',
      load: api.achievements,
      isEmpty: (data) => data.isEmpty,
      emptyMessage: 'Награды появятся, когда начнёте выполнять план',
      emptyIcon: Icons.emoji_events_outlined,
      builder: (context, achievements) {
        final unlocked = achievements.where((a) => a.isUnlocked).toList();
        final goals = achievements.where((a) => !a.isUnlocked).toList();
        final points = unlocked.fold<int>(0, (sum, a) => sum + a.points);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            HeroFigure(
              label: 'Получено наград',
              value: '${unlocked.length} из ${achievements.length}',
              caption: '$points баллов набрано',
              icon: Icons.emoji_events_outlined,
            ),
            if (unlocked.isNotEmpty) ...[
              SizedBox(height: gap(3.5)),
              const SectionLabel('Получены'),
              Panel(
                children: [
                  for (final item in unlocked) _awardRow(context, item),
                ],
              ),
            ],
            if (goals.isNotEmpty) ...[
              SizedBox(height: gap(3.5)),
              const SectionLabel('Ещё впереди'),
              Panel(
                children: [for (final item in goals) _awardRow(context, item)],
              ),
            ],
            SizedBox(height: gap(2)),
          ],
        );
      },
    );
  }
}

/// Строка награды. Полученная помечена золотом, цель остаётся спокойной —
/// иначе список целей выглядит как список провалов.
Widget _awardRow(BuildContext context, Achievement achievement) {
  final palette = context.palette;
  final unlocked = achievement.isUnlocked;

  return PanelRow(
    title: achievement.title,
    subtitle: unlocked
        ? 'Получено ${formatDate(achievement.unlockedAt!.toIso8601String())}'
        : achievement.description,
    accent: unlocked ? palette.warning : null,
    trailing: RowValue(
      '+${achievement.points}',
      color: unlocked ? palette.warning : null,
      muted: !unlocked,
    ),
  );
}
