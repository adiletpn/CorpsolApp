import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../theme.dart';
import '../widgets/period_screen.dart';
import '../widgets/ui.dart';

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
            AppCard(
              child: Row(
                children: [
                  const Icon(Icons.emoji_events, color: AppColors.warning, size: 36),
                  SizedBox(width: gap(2)),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${unlocked.length} из ${achievements.length}',
                          style: const TextStyle(
                            color: AppColors.text,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '$points баллов набрано',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (unlocked.isNotEmpty) ...[
              SizedBox(height: gap(2.5)),
              Text('Получены', style: Theme.of(context).textTheme.titleMedium),
              SizedBox(height: gap(1.5)),
              for (final item in unlocked) ...[
                _AchievementCard(achievement: item),
                SizedBox(height: gap(1)),
              ],
            ],
            if (goals.isNotEmpty) ...[
              SizedBox(height: gap(2)),
              Text('Ещё не получены', style: Theme.of(context).textTheme.titleMedium),
              SizedBox(height: gap(1.5)),
              for (final item in goals) ...[
                _AchievementCard(achievement: item),
                SizedBox(height: gap(1)),
              ],
            ],
          ],
        );
      },
    );
  }
}

class _AchievementCard extends StatelessWidget {
  const _AchievementCard({required this.achievement});

  final Achievement achievement;

  @override
  Widget build(BuildContext context) {
    final unlocked = achievement.isUnlocked;

    return Opacity(
      // Неполученные показываем приглушённо: это цель, а не достижение.
      opacity: unlocked ? 1 : 0.55,
      child: AppCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              unlocked ? Icons.military_tech : Icons.lock_outline,
              color: unlocked ? AppColors.warning : AppColors.textMuted,
              size: 28,
            ),
            SizedBox(width: gap(2)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(achievement.title, style: Theme.of(context).textTheme.bodyMedium),
                  SizedBox(height: gap(0.25)),
                  Text(
                    achievement.description,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (unlocked) ...[
                    SizedBox(height: gap(0.5)),
                    Text(
                      'Получено ${formatDate(achievement.unlockedAt!.toIso8601String())}',
                      style: const TextStyle(color: AppColors.success, fontSize: 13),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(width: gap(1)),
            Text(
              '+${achievement.points}',
              style: TextStyle(
                color: unlocked ? AppColors.warning : AppColors.textMuted,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
