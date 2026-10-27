import { formatMinor } from '@corpsol/shared';
import React from 'react';

import { api, type Offer } from '../api';
import { formatDate, monthRange } from '../format';
import { StackedBar, chart } from '../charts';
import { PeriodScreen } from '../PeriodScreen';
import { Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

const STATUS_LABELS: Record<Offer['status'], string> = {
  SENT: 'Отправлен',
  ACCEPTED: 'Принят',
  REJECTED: 'Отклонён',
  EXPIRED: 'Истёк',
};

export function Offers() {
  const month = monthRange();

  return (
    <PeriodScreen
      title="Сделки"
      subtitle="Отправленные офферы за месяц"
      load={() => api.offers(month.from, month.to)}
      isEmpty={(offers) => offers.length === 0}
      emptyMessage="За этот месяц сделок пока нет"
      emptyIcon="handshake"
    >
      {(offers) => {
        const accepted = offers.filter((offer) => offer.status === 'ACCEPTED');
        const sent = offers.filter((offer) => offer.status === 'SENT');
        const lost = offers.filter((offer) => offer.status === 'REJECTED' || offer.status === 'EXPIRED');
        const acceptedSum = accepted.reduce((sum, offer) => sum + offer.amountMinor, 0);
        // Свежие сверху: вчерашняя сделка нужна чаще, чем первая в месяце.
        const sorted = [...offers].sort((a, b) => b.sentDate.localeCompare(a.sentDate));

        return (
          <>
            <HeroFigure
              label="Сумма принятых"
              value={formatMinor(acceptedSum)}
              caption={`${accepted.length} из ${offers.length} сделок приняты`}
              icon="handshake"
            />
            <Gap size={1} />
            {/* Часть целого одной полосой: доля принятых видна без подсчёта.
                Отказ и истёкший срок — один сегмент: обе сделки потеряны. */}
            <Panel>
              <StackedBar
                caption={`Из ${offers.length} сделок принято ${accepted.length}, в работе ${sent.length}, не состоялись ${lost.length}`}
                segments={[
                  { key: 'accepted', label: 'Приняты', value: accepted.length, color: chart.good },
                  { key: 'sent', label: 'В работе', value: sent.length, color: chart.accent },
                  { key: 'lost', label: 'Не состоялись', value: lost.length, color: chart.bad },
                ]}
              />
            </Panel>
            <Gap size={3} />
            <SectionLabel>Все сделки</SectionLabel>
            <Panel>
              {sorted.map((offer) => (
                <OfferRow key={offer.id} offer={offer} />
              ))}
            </Panel>
          </>
        );
      }}
    </PeriodScreen>
  );
}

/** Отказ и истёкший срок помечены засечкой — остальное обычный ход дел. */
function OfferRow({ offer }: { offer: Offer }) {
  const failed = offer.status === 'REJECTED' || offer.status === 'EXPIRED';

  return (
    <PanelRow
      title={offer.clientName}
      subtitle={`${formatDate(offer.sentDate)} · ${STATUS_LABELS[offer.status]}`}
      accent={offer.status === 'REJECTED' ? tone.danger : offer.status === 'EXPIRED' ? tone.faint : undefined}
      trailing={
        <RowValue color={offer.status === 'ACCEPTED' ? tone.success : undefined} muted={failed}>
          {formatMinor(offer.amountMinor)}
        </RowValue>
      }
    />
  );
}
