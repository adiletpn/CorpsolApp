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
    final palette = context.palette;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        HeroFigure(
          label: payrollStatusLabel(payroll.status),
          value: formatMoney(payroll.totalMinor),
          caption:
              'к выплате за ${formatDate(payroll.periodStart)} — '
              '${formatDate(payroll.periodEnd)}',
          icon: Icons.account_balance_wallet_outlined,
        ),
        SizedBox(height: gap(3.5)),
        const SectionLabel('Из чего сложилось'),
        Panel(
          children: [
            PanelRow(
              title: 'Оклад',
              trailing: RowValue(formatMoney(payroll.baseSalaryMinor)),
            ),
            PanelRow(
              title: 'Бонусы',
              trailing: RowValue(
                formatMoney(payroll.bonusMinor),
                color: payroll.bonusMinor > 0 ? palette.success : null,
              ),
            ),
            if (payroll.penaltyMinor != 0)
              PanelRow(
                title: 'Удержания',
                accent: palette.danger,
                trailing: RowValue(
                  formatMoney(-payroll.penaltyMinor.abs()),
                  color: palette.danger,
                ),
              ),
          ],
        ),
        if (payroll.lines.isNotEmpty) ...[
          SizedBox(height: gap(3.5)),
          const SectionLabel('Подробно'),
          Panel(
            children: [
              for (final line in payroll.lines)
                PanelRow(
                  title: line.title,
                  trailing: RowValue(
                    formatMoney(line.amountMinor),
                    color: line.amountMinor < 0 ? palette.danger : null,
                    muted: line.amountMinor == 0,
                  ),
                ),
            ],
          ),
        ],
        SizedBox(height: gap(2)),
      ],
    );
  }
}
