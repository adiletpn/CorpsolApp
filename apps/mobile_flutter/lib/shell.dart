import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'screens/leaderboard_screen.dart';
import 'screens/offers_screen.dart';
import 'screens/payroll_screen.dart';
import 'screens/scan_screen.dart';
import 'theme.dart';

/// Вкладки нижней навигации. Порядок повторяет прежнее приложение,
/// чтобы сотрудникам не пришлось переучиваться.
enum TabKey {
  home('Приход', Icons.how_to_reg_outlined),
  offers('Сделки', Icons.handshake_outlined),
  payroll('Зарплата', Icons.payments_outlined),
  rating('Рейтинг', Icons.leaderboard_outlined),
  awards('Награды', Icons.emoji_events_outlined);

  const TabKey(this.label, this.icon);

  final String label;
  final IconData icon;
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  TabKey _active = TabKey.home;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(bottom: false, child: _buildTab(_active)),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              for (final tab in TabKey.values)
                Expanded(
                  child: _TabButton(
                    tab: tab,
                    active: tab == _active,
                    onTap: () => setState(() => _active = tab),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Скан открывается поверх вкладок: во время отметки сотруднику
  /// некуда переключаться, пока камера не вернёт результат.
  Future<void> _openScanner() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => ScanScreen(onDone: () => Navigator.of(context).pop()),
      ),
    );
    // Табель на главной мог измениться — перестраиваем вкладку.
    if (mounted) setState(() {});
  }

  Widget _buildTab(TabKey tab) => switch (tab) {
        TabKey.home => HomeScreen(onScan: _openScanner),
        TabKey.offers => const OffersScreen(),
        TabKey.payroll => const PayrollScreen(),
        TabKey.rating => const LeaderboardScreen(),
        TabKey.awards => const _Pending('Награды'),
      };
}

class _TabButton extends StatelessWidget {
  const _TabButton({required this.tab, required this.active, required this.onTap});

  final TabKey tab;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.accent : AppColors.textMuted;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: gap(1)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(tab.icon, color: color, size: 22),
            SizedBox(height: gap(0.5)),
            Text(
              tab.label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: active ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Заглушка вкладки: экраны переносятся по одному, каждый следующий
/// коммит заменяет одну такую заглушку настоящим экраном.
class _Pending extends StatelessWidget {
  const _Pending(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Center(
        child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
      );
}
