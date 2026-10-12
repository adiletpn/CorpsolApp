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
        final palette = context.palette;
        final accepted = offers.where((o) => o.status == OfferStatus.accepted);
        final sent = offers.where((o) => o.status == OfferStatus.sent);
        final acceptedSum = accepted.fold<int>(
          0,
          (sum, o) => sum + o.amountMinor,
        );

        // Свежие сверху: вчерашняя сделка нужна чаще, чем первая в месяце.
        final sorted = [...offers]
          ..sort((a, b) => b.sentDate.compareTo(a.sentDate));

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            HeroFigure(
              label: 'Сумма принятых',
              value: formatMoney(acceptedSum),
              caption: '${accepted.length} из ${offers.length} сделок приняты',
              icon: Icons.handshake_outlined,
            ),
            SizedBox(height: gap(1.5)),
            FigureRow(
              items: [
                Figure(value: '${offers.length}', label: 'всего'),
                Figure(
                  value: '${accepted.length}',
                  label: 'принято',
                  color: palette.success,
                ),
                Figure(value: '${sent.length}', label: 'в работе'),
              ],
            ),
            SizedBox(height: gap(3.5)),
            const SectionLabel('Все сделки'),
            Panel(
              children: [for (final offer in sorted) _offerRow(context, offer)],
            ),
            SizedBox(height: gap(2)),
          ],
        );
      },
    );
  }
}

/// Строка сделки. Отказ и истёкший срок помечены засечкой —
/// отправленную и принятую подсвечивать незачем, это обычный ход дел.
Widget _offerRow(BuildContext context, Offer offer) {
  final palette = context.palette;
  final failed =
      offer.status == OfferStatus.rejected ||
      offer.status == OfferStatus.expired;

  return PanelRow(
    title: offer.clientName,
    subtitle:
        '${formatDate(offer.sentDate)} · ${offerStatusLabel(offer.status)}',
    accent: failed ? offerStatusColor(offer.status, palette) : null,
    trailing: RowValue(
      formatMoney(offer.amountMinor),
      color: offer.status == OfferStatus.accepted ? palette.success : null,
      muted: failed,
    ),
  );
}
