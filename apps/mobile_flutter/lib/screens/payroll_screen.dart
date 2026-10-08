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

class PayrollScreen extends StatelessWidget {
  const PayrollScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<CorpsolApi>();

    return PeriodScreen<List<Payroll>>(
      title: 'Зарплата',
      subtitle: 'Оклад, бонусы и удержания',
      load: () => api.payroll(currentMonth().from),
      isEmpty: (data) => data.isEmpty,
      emptyMessage: 'Расчёт за этот месяц ещё не готов',
      emptyIcon: Icons.payments_outlined,
      builder: (context, payrolls) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final payroll in payrolls) ...[
            _PayrollCard(payroll: payroll),
            SizedBox(height: gap(2)),
          ],
        ],
      ),
    );
  }
}

class _PayrollCard extends StatelessWidget {
  const _PayrollCard({required this.payroll});

  final Payroll payroll;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GradientCard(
          padding: EdgeInsets.all(gap(3)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${formatDate(payroll.periodStart)} — ${formatDate(payroll.periodEnd)}',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.78),
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: gap(1.25),
                      vertical: gap(0.5),
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      payrollStatusLabel(payroll.status),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: gap(2)),
              Text(
                formatMoney(payroll.totalMinor),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 42,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.2,
                ),
              ),
              SizedBox(height: gap(0.5)),
              Text(
                'к выплате за месяц',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.78),
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: gap(1.5)),
        AppCard(
          padding: EdgeInsets.all(gap(2.25)),
          child: Column(
            children: [
              _Row(
                icon: Icons.account_balance_wallet_outlined,
                color: context.palette.accent,
                label: 'Оклад',
                amount: payroll.baseSalaryMinor,
              ),
              _Row(
                icon: Icons.trending_up_rounded,
                color: context.palette.success,
                label: 'Бонусы',
                amount: payroll.bonusMinor,
              ),
              if (payroll.penaltyMinor != 0)
                _Row(
                  icon: Icons.trending_down_rounded,
                  color: context.palette.danger,
                  label: 'Удержания',
                  amount: -payroll.penaltyMinor.abs(),
                ),
            ],
          ),
        ),
        if (payroll.lines.isNotEmpty) ...[
          SizedBox(height: gap(2.5)),
          Text(
            'Из чего сложилось',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          SizedBox(height: gap(1.5)),
          for (final line in payroll.lines) ...[
            AppCard(
              padding: EdgeInsets.all(gap(1.75)),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      line.title,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    formatMoney(line.amountMinor),
                    style: TextStyle(
                      color: line.amountMinor < 0
                          ? context.palette.danger
                          : context.palette.success,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: gap(1)),
          ],
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.color,
    required this.label,
    required this.amount,
  });

  final IconData icon;
  final Color color;
  final String label;
  final int amount;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.symmetric(vertical: gap(0.75)),
    child: Row(
      children: [
        IconChip(icon: icon, color: color, size: 38),
        SizedBox(width: gap(1.5)),
        Expanded(
          child: Text(
            label,
            style: TextStyle(color: context.palette.textMuted, fontSize: 14.5),
          ),
        ),
        Text(
          formatMoney(amount),
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
