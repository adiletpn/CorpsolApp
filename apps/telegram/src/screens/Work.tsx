import { PLAN_METRIC_LABELS, formatMinor, type PlanMetric } from '@corpsol/shared';
import React from 'react';

import { api, type Plan } from '../api';
import { monthRange, monthTitle, percent } from '../format';
import { Card, Empty, Figure, LoadError, Progress, ScreenTitle, Skeleton } from '../ui';
import { useLoad } from '../useLoad';

/** Выручка в плане хранится в тиынах — остальное штуками и минутами. */
function metricValue(metric: PlanMetric, value: number): string {
  if (metric === 'REVENUE') return formatMinor(value);
  return Math.round(value).toLocaleString('ru-RU');
}

export function Work() {
  const month = monthRange();

  const data = useLoad(async () => {
    const [plans, calls] = await Promise.all([api.plans(month.from), api.callsSummary(month.from, month.to)]);
    return { plans, calls };
  });

  return (
    <>
      <ScreenTitle title="Работа" subtitle={monthTitle()} />

      {data.error ? <LoadError message={data.error} onRetry={data.reload} /> : null}
      {data.loading && !data.data ? <Skeleton lines={4} /> : null}

      {data.data ? (
        <>
          <Card title="Звонки за месяц">
            <div className="figures">
              <Figure value={data.data.calls.total.toLocaleString('ru-RU')} label="всего" />
              <Figure
                value={`${percent(data.data.calls.outboundAnswered, data.data.calls.outbound)}%`}
                label="дозвонов"
              />
              <Figure value={data.data.calls.talkMinutes.toLocaleString('ru-RU')} label="минут" />
            </div>
          </Card>

          <Card title="Планы">
            {data.data.plans.length === 0 ? (
              <Empty>Планы на этот месяц ещё не поставлены.</Empty>
            ) : (
              <div className="plans">
                {sortPlans(data.data.plans).map((plan) => (
                  <PlanRow key={plan.id} plan={plan} />
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

/** Сначала свой план, потом план отдела: своё человеку важнее. */
function sortPlans(plans: Plan[]): Plan[] {
  return [...plans].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'USER' ? -1 : 1));
}

function PlanRow({ plan }: { plan: Plan }) {
  const { metric, achieved, target, ratio, isComplete } = plan.progress;

  return (
    <div className="plan">
      <div className="plan-head">
        <div>
          <div className="plan-title">{PLAN_METRIC_LABELS[metric]}</div>
          <div className="muted small">{plan.scope === 'USER' ? 'Мой план' : 'План отдела'}</div>
        </div>
        <div className={`plan-ratio ${isComplete ? 'tone-success' : ''}`}>{Math.floor(ratio * 100)}%</div>
      </div>
      <Progress ratio={ratio} tone={isComplete ? 'success' : undefined} />
      <div className="muted small">
        {metricValue(metric, achieved)} из {metricValue(metric, target)}
      </div>
    </div>
  );
}
