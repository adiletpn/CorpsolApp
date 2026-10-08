import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/labels.dart';
import '../core/period.dart';
import '../theme.dart';
import '../widgets/period_screen.dart';
import '../widgets/ui.dart';

class OffersScreen extends StatelessWidget {
  const OffersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<CorpsolApi>();
    final period = currentMonth();

    return PeriodScreen<List<Offer>>(
      title: 'Сделки',
      subtitle: 'Отправленные офферы за месяц',
      load: () => api.offers(from: period.from, to: period.to),
      isEmpty: (data) => data.isEmpty,
      emptyMessage: 'За этот месяц сделок пока нет',
      emptyIcon: Icons.handshake_outlined,
      builder: (context, offers) {
        final accepted = offers.where((o) => o.status == OfferStatus.accepted);
        final acceptedSum = accepted.fold<int>(0, (sum, o) => sum + o.amountMinor);

        // Свежие сверху: вчерашняя сделка нужна чаще, чем первое число месяца.
        final sorted = [...offers]
          ..sort((a, b) => b.sentDate.compareTo(a.sentDate));

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: _Tile(
                    value: '${offers.length}',
                    label: 'всего',
                    color: AppColors.text,
                  ),
                ),
                SizedBox(width: gap(1.5)),
                Expanded(
                  child: _Tile(
                    value: '${accepted.length}',
                    label: 'принято',
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
            SizedBox(height: gap(1.5)),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Сумма принятых', style: Theme.of(context).textTheme.bodySmall),
                  SizedBox(height: gap(0.5)),
                  Text(
                    formatMoney(acceptedSum),
                    style: const TextStyle(
                      color: AppColors.success,
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: gap(2.5)),
            for (final offer in sorted) ...[
              _OfferRow(offer: offer),
              SizedBox(height: gap(1)),
            ],
          ],
        );
      },
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.value, required this.label, required this.color});

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: TextStyle(color: color, fontSize: 28, fontWeight: FontWeight.w700),
            ),
            SizedBox(height: gap(0.25)),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}

class _OfferRow extends StatelessWidget {
  const _OfferRow({required this.offer});

  final Offer offer;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer.clientName, style: Theme.of(context).textTheme.bodyMedium),
                  SizedBox(height: gap(0.25)),
                  Text(
                    '${formatDate(offer.sentDate)} · ${formatMoney(offer.amountMinor)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            StatusChip(
              label: offerStatusLabel(offer.status),
              color: offerStatusColor(offer.status),
            ),
          ],
        ),
      );
}
