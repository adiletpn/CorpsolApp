import { PLAN_METRIC_LABELS, formatMinor } from '@corpsol/shared';
import React from 'react';

import { api, type Call, type Plan } from '../api';
import { formatDate, monthRange, percent, timeLabel } from '../format';
import { PeriodScreen } from '../PeriodScreen';
import { Figure, FigureRow, Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

const CALL_STATUS_LABELS: Record<Call['status'], string> = {
  ANSWERED: 'Отвечен',
  NO_ANSWER: 'Нет ответа',
  BUSY: 'Занято',
  FAILED: 'Сбой',
};

export function Work() {
  const month = monthRange();

  return (
    <PeriodScreen
      title="Работа"
      subtitle="План отдела и ваши звонки за месяц"
      load={async () => {
        const [plans, summary, page] = await Promise.all([
          api.plans(month.from),
          api.callsSummary(month.from, month.to),
          api.calls(month.from, month.to),
        ]);
        return { plans, summary, calls: page.items };
      }}
      emptyMessage="Данных за месяц пока нет"
      emptyIcon="insights"
    >
      {({ plans, summary, calls }) => {
        const department = plans.filter((plan) => plan.scope === 'DEPARTMENT');
        const personal = plans.filter((plan) => plan.scope === 'USER');
        // Свежие сверху: вчерашний звонок нужен чаще, чем первый в месяце.
        const sorted = [...calls].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

        return (
          <>
            <HeroFigure
              label="Дозвонились"
              value={`${percent(summary.answered, summary.total)}%`}
              caption={`${summary.answered} из ${summary.total} звонков`}
              icon="call"
            />
            <Gap size={1} />
            <FigureRow>
              <Figure value={String(summary.total)} label="всего звонков" />
              <Figure value={String(summary.talkMinutes)} label="минут разговора" />
            </FigureRow>

            {department.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel>План отдела</SectionLabel>
                <Panel>
                  {department.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} />
                  ))}
                </Panel>
              </>
            ) : null}

            {personal.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel>Ваш план</SectionLabel>
                <Panel>
                  {personal.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} />
                  ))}
                </Panel>
              </>
            ) : null}

            <Gap size={3} />
            <SectionLabel>Звонки</SectionLabel>
            <Panel>
              {sorted.length === 0 ? (
                <PanelRow title="За этот месяц звонков нет" trailing={<RowValue muted>—</RowValue>} />
              ) : (
                sorted.slice(0, 40).map((call) => <CallRow key={call.id} call={call} />)
              )}
            </Panel>
          </>
        );
      }}
    </PeriodScreen>
  );
}

/** Полоса выполнения занимает всю ширину под текстом — своя разметка. */
function PlanRow({ plan }: { plan: Plan }) {
  const { metric, achieved, target, remaining, ratio, isComplete } = plan.progress;
  const color = isComplete ? tone.success : tone.accent;
  const format = (value: number) => (metric === 'REVENUE' ? formatMinor(Math.round(value)) : String(Math.round(value)));

  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title">{PLAN_METRIC_LABELS[metric]}</span>
        <RowValue color={color}>{Math.round(ratio * 100)}%</RowValue>
      </div>
      <div className="progress">
        <div style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%`, background: color }} />
      </div>
      <p className="plan-caption">
        {isComplete
          ? `Выполнен: ${format(achieved)} из ${format(target)}`
          : `${format(achieved)} из ${format(target)} · осталось ${format(remaining)}`}
      </p>
    </div>
  );
}

/** Засечка только у недозвонов — отвеченный звонок это норма. */
function CallRow({ call }: { call: Call }) {
  const answered = call.status === 'ANSWERED';
  const minutes = Math.floor(call.talkSeconds / 60);
  const seconds = String(call.talkSeconds % 60).padStart(2, '0');

  return (
    <PanelRow
      title={call.clientPhone}
      subtitle={`${formatDate(call.callDate)} · ${timeLabel(call.startedAt)}${call.direction === 'INBOUND' ? ' · входящий' : ''}`}
      accent={answered ? undefined : tone.faint}
      trailing={answered ? <RowValue>{`${minutes}:${seconds}`}</RowValue> : <RowValue muted>{CALL_STATUS_LABELS[call.status]}</RowValue>}
    />
  );
}
