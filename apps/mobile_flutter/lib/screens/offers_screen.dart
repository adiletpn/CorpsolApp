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
        final acceptedSum = accepted.fold<int>(
          0,
          (sum, o) => sum + o.amountMinor,
        );

        // Свежие сверху: вчерашняя сделка нужна чаще, чем первое число месяца.
        final sorted = [...offers]
          ..sort((a, b) => b.sentDate.compareTo(a.sentDate));

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GradientCard(
              padding: EdgeInsets.all(gap(3)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Сумма принятых',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.78),
                      fontSize: 14,
                    ),
                  ),
                  SizedBox(height: gap(1)),
                  Text(
                    formatMoney(acceptedSum),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 38,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: gap(1.5)),
            Row(
              children: [
                Expanded(
                  child: StatTile(
                    value: '${offers.length}',
                    label: 'всего',
                    color: AppColors.text,
                  ),
                ),
                SizedBox(width: gap(1.25)),
                Expanded(
                  child: StatTile(
                    value: '${accepted.length}',
                    label: 'принято',
                    color: AppColors.success,
                  ),
                ),
                SizedBox(width: gap(1.25)),
                Expanded(
                  child: StatTile(
                    value:
                        '${offers.where((o) => o.status == OfferStatus.sent).length}',
                    label: 'в работе',
                    color: AppColors.accent,
                  ),
                ),
              ],
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

class _OfferRow extends StatelessWidget {
  const _OfferRow({required this.offer});

  final Offer offer;

  IconData get _icon => switch (offer.status) {
    OfferStatus.accepted => Icons.check_rounded,
    OfferStatus.rejected => Icons.close_rounded,
    OfferStatus.expired => Icons.hourglass_disabled_outlined,
    OfferStatus.sent => Icons.send_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final color = offerStatusColor(offer.status);

    return AppCard(
      padding: EdgeInsets.all(gap(1.75)),
      child: Row(
        children: [
          IconChip(icon: _icon, color: color),
          SizedBox(width: gap(1.75)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offer.clientName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                SizedBox(height: gap(0.25)),
                Text(
                  formatDate(offer.sentDate),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          SizedBox(width: gap(1)),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatMoney(offer.amountMinor),
                style: const TextStyle(
                  color: AppColors.text,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: gap(0.5)),
              StatusChip(label: offerStatusLabel(offer.status), color: color),
            ],
          ),
        ],
      ),
    );
  }
}
