import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
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
    return AppCard(
      padding: EdgeInsets.all(gap(2.5)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${formatDate(payroll.periodStart)} — ${formatDate(payroll.periodEnd)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              StatusChip(
                label: payrollStatusLabel(payroll.status),
                color: payroll.status == PayrollStatus.paid
                    ? AppColors.success
                    : AppColors.textMuted,
              ),
            ],
          ),
          SizedBox(height: gap(1.5)),
          Text(
            formatMoney(payroll.totalMinor),
            style: const TextStyle(
              color: AppColors.text,
              fontSize: 34,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: gap(2)),
          _Row(label: 'Оклад', amount: payroll.baseSalaryMinor),
          _Row(label: 'Бонусы', amount: payroll.bonusMinor, color: AppColors.success),
          if (payroll.penaltyMinor != 0)
            _Row(
              label: 'Удержания',
              amount: -payroll.penaltyMinor.abs(),
              color: AppColors.danger,
            ),
          if (payroll.lines.isNotEmpty) ...[
            Padding(
              padding: EdgeInsets.symmetric(vertical: gap(1.5)),
              child: const Divider(color: AppColors.border, height: 1),
            ),
            Text('Из чего сложилось', style: Theme.of(context).textTheme.bodySmall),
            SizedBox(height: gap(1)),
            for (final line in payroll.lines)
              _Row(
                label: line.title,
                amount: line.amountMinor,
                color: line.amountMinor < 0 ? AppColors.danger : null,
              ),
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.amount, this.color});

  final String label;
  final int amount;
  final Color? color;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.symmetric(vertical: gap(0.5)),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
              ),
            ),
            Text(
              formatMoney(amount),
              style: TextStyle(
                color: color ?? AppColors.text,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
}
