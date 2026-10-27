import { formatMinor } from '@corpsol/shared';
import React from 'react';

import { api, type Offer, type Payroll } from '../api';
import { dayLabel, monthRange, monthTitle } from '../format';
import { Badge, Card, Empty, LoadError, Row, ScreenTitle, Skeleton } from '../ui';
import { useLoad } from '../useLoad';

const OFFER_STATUS: Record<Offer['status'], { label: string; tone: 'accent' | 'success' | 'danger' | 'neutral' }> = {
  SENT: { label: 'Отправлен', tone: 'accent' },
  ACCEPTED: { label: 'Принят', tone: 'success' },
  REJECTED: { label: 'Отклонён', tone: 'danger' },
  EXPIRED: { label: 'Истёк', tone: 'neutral' },
};

export function Money() {
  const now = new Date();
  const month = monthRange(now);
  const previous = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const data = useLoad(async () => {
    const [current, past, offers] = await Promise.all([
      api.payroll(month.from),
      api.payroll(previous.from),
      api.offers(month.from, month.to),
    ]);
    // Расчёт ищется по началу месяца — на стыке периодов один лист
    // может прийти в обоих ответах, показывать его дважды незачем.
    const payrolls = [...current, ...past].filter(
      (payroll, index, all) => all.findIndex((item) => item.id === payroll.id) === index,
    );
    return { payrolls, offers };
  });

  return (
    <>
      <ScreenTitle title="Деньги" subtitle={monthTitle()} />

      {data.error ? <LoadError message={data.error} onRetry={data.reload} /> : null}
      {data.loading && !data.data ? <Skeleton lines={4} /> : null}

      {data.data ? (
        <>
          {data.data.payrolls.length === 0 ? (
            <Card title="Зарплата">
              {/* Черновик сотруднику не показывают: суммы ещё изменятся пересчётом. */}
              <Empty>Расчёт появится, когда руководитель его утвердит.</Empty>
            </Card>
          ) : (
            data.data.payrolls.map((payroll) => <PayrollCard key={payroll.id} payroll={payroll} />)
          )}

          <Offers offers={data.data.offers} />
        </>
      ) : null}
    </>
  );
}

function PayrollCard({ payroll }: { payroll: Payroll }) {
  const [year, month] = payroll.periodStart.split('-').map(Number);

  return (
    <Card
      title={monthTitle(new Date(year, month - 1, 1))}
      action={<Badge tone={payroll.status === 'PAID' ? 'success' : 'accent'}>{payroll.status === 'PAID' ? 'Выплачено' : 'Утверждено'}</Badge>}
    >
      <div className="total">{formatMinor(payroll.totalMinor)}</div>
      <div className="list">
        <Row title="Оклад" trailing={formatMinor(payroll.baseSalaryMinor)} />
        {payroll.lines.map((line) => (
          <Row
            key={line.ruleId + line.kind}
            title={line.title}
            trailing={
              <span className={line.amountMinor < 0 || line.kind.endsWith('PENALTY') ? 'tone-danger' : 'tone-success'}>
                {line.kind.endsWith('PENALTY') ? '−' : '+'}
                {formatMinor(Math.abs(line.amountMinor))}
              </span>
            }
          />
        ))}
      </div>
    </Card>
  );
}

function Offers({ offers }: { offers: Offer[] }) {
  const accepted = offers.filter((offer) => offer.status === 'ACCEPTED');
  const revenue = accepted.reduce((total, offer) => total + offer.amountMinor, 0);

  return (
    <Card title="Сделки" action={<span className="muted small">{accepted.length} принято</span>}>
      {offers.length === 0 ? (
        <Empty>В этом месяце сделок пока нет.</Empty>
      ) : (
        <>
          <div className="total small-total">{formatMinor(revenue)}</div>
          <p className="muted small">выручка по принятым</p>
          <div className="list">
            {offers.map((offer) => (
              <Row
                key={offer.id}
                title={offer.clientName}
                subtitle={`${dayLabel(offer.sentDate)} · ${formatMinor(offer.amountMinor)}`}
                trailing={<Badge tone={OFFER_STATUS[offer.status].tone}>{OFFER_STATUS[offer.status].label}</Badge>}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
