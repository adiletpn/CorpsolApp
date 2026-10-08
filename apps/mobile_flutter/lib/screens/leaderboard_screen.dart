import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../state/auth_controller.dart';
import '../palette.dart';
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

    return GradientCard(
      padding: EdgeInsets.all(gap(3)),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Ваше место',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.78),
                  fontSize: 14,
                ),
              ),
              SizedBox(height: gap(0.5)),
              Text(
                '${entry.rank}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 56,
                  fontWeight: FontWeight.w800,
                  height: 1,
                  letterSpacing: -2,
                ),
              ),
            ],
          ),
          SizedBox(width: gap(3)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${entry.points} баллов',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: gap(0.75)),
                Text(
                  leading
                      ? 'Вы впереди всех'
                      : 'До первого места ${entry.pointsBehindLeader} баллов',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.82),
                    fontSize: 14,
                    height: 1.35,
                  ),
                ),
              ],
            ),
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

  /// Первая тройка выделена золотом, серебром и бронзой.
  /// Медали одинаковы в обеих темах — это не цвет интерфейса, а значок.
  Color _rankColor(AppPalette palette) => switch (entry.rank) {
    1 => const Color(0xFFFFC53D),
    2 => const Color(0xFFA8AEBF),
    3 => const Color(0xFFCD7F32),
    _ => palette.textFaint,
  };

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(gap(1.75)),
    decoration: BoxDecoration(
      color: isSelf ? context.palette.surfaceRaised : context.palette.surface,
      borderRadius: BorderRadius.circular(AppRadius.md),
      border: Border.all(
        color: isSelf ? context.palette.accent : context.palette.border,
      ),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 34,
          child: Text(
            '${entry.rank}',
            style: TextStyle(
              color: _rankColor(context.palette),
              fontSize: 19,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        Expanded(
          child: Text(
            entry.fullName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.palette.text,
              fontSize: 15,
              fontWeight: isSelf ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
        Text(
          '${entry.points}',
          style: TextStyle(
            color: context.palette.text,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}
