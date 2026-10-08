import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
import '../theme.dart';
import '../widgets/period_screen.dart';
import '../widgets/ui.dart';

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
      builder: (context, board) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (board.self != null) ...[
            _SelfCard(entry: board.self!),
            SizedBox(height: gap(2.5)),
          ],
          for (final entry in board.entries) ...[
            _EntryRow(entry: entry, isSelf: entry.userId == selfId),
            SizedBox(height: gap(1)),
          ],
        ],
      ),
    );
  }
}

class _SelfCard extends StatelessWidget {
  const _SelfCard({required this.entry});

  final RankedEntry entry;

  @override
  Widget build(BuildContext context) {
    final leading = entry.pointsBehindLeader == 0;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(gap(2.5)),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.accent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ваше место', style: Theme.of(context).textTheme.bodySmall),
          SizedBox(height: gap(0.5)),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '${entry.rank}',
                style: const TextStyle(
                  color: AppColors.accent,
                  fontSize: 44,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(width: gap(1.5)),
              Text(
                '${entry.points} баллов',
                style: const TextStyle(color: AppColors.text, fontSize: 17),
              ),
            ],
          ),
          SizedBox(height: gap(1)),
          Text(
            leading
                ? 'Вы впереди всех'
                : 'До первого места ${entry.pointsBehindLeader} баллов',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry, required this.isSelf});

  final RankedEntry entry;
  final bool isSelf;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(
          children: [
            SizedBox(
              width: 36,
              child: Text(
                '${entry.rank}',
                style: TextStyle(
                  color: entry.rank <= 3 ? AppColors.warning : AppColors.textMuted,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Expanded(
              child: Text(
                entry.fullName,
                style: TextStyle(
                  color: AppColors.text,
                  fontSize: 15,
                  fontWeight: isSelf ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ),
            Text(
              '${entry.points}',
              style: const TextStyle(
                color: AppColors.text,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
}
