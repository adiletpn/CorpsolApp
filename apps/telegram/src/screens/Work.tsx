import { PLAN_METRIC_LABELS, formatMinor } from '@corpsol/shared';
import React from 'react';

import { api, type Call, type Plan, type RankedEntry } from '../api';
import { formatDate, initialsOf, monthRange, percent, timeLabel } from '../format';
import { RingMeter } from '../charts';
import { PeriodScreen } from '../PeriodScreen';
import { useSession } from '../session';
import { Figure, FigureRow, Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

const CALL_STATUS_LABELS: Record<Call['status'], string> = {
  ANSWERED: 'Отвечен',
  NO_ANSWER: 'Нет ответа',
  BUSY: 'Занято',
  FAILED: 'Сбой',
};

/** Медальные цвета первой тройки — как во Flutter. */
const MEDALS: Record<number, string> = { 1: '#FFC53D', 2: '#A8AEBF', 3: '#CD7F32' };

export function Work() {
  const { user } = useSession();
  const month = monthRange();

  return (
    <PeriodScreen
      title="Работа"
      subtitle="Планы, рейтинг отдела и звонки за месяц"
      load={async () => {
        const [plans, summary, page, board] = await Promise.all([
          api.plans(month.from),
          api.callsSummary(month.from, month.to),
          api.calls(month.from, month.to),
          api.leaderboard(month.from, month.to),
        ]);
        return { plans, summary, calls: page.items, hasMore: page.nextBefore !== null, board };
      }}
      emptyMessage="Данных за месяц пока нет"
      emptyIcon="insights"
    >
      {({ plans, summary, calls, hasMore, board }) => {
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
                <PlanRings plans={department} />
              </>
            ) : null}

            {personal.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel>Ваш план</SectionLabel>
                <PlanRings plans={personal} />
              </>
            ) : null}

            {board.entries.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel
                  trailing={
                    board.self ? (
                      <span>
                        вы {board.self.rank}-й · {board.self.points} баллов
                      </span>
                    ) : null
                  }
                >
                  Рейтинг отдела
                </SectionLabel>
                <Panel>
                  <Podium entries={board.entries.slice(0, 3)} selfId={user?.id} />
                  {board.entries.slice(3).map((entry) => (
                    <EntryRow key={entry.userId} entry={entry} isSelf={entry.userId === user?.id} />
                  ))}
                </Panel>
              </>
            ) : null}

            <Gap size={3} />
            {/* Журнал — первые 40: без пометки казалось бы, что звонков всего столько. */}
            <SectionLabel trailing={hasMore ? <span>последние {calls.length}</span> : null}>
              Звонки
            </SectionLabel>
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

/**
 * Планы кольцами в сетке по два: сколько сделано видно сразу,
 * а не после чтения строки «612 из 900 · осталось 288».
 */
function PlanRings({ plans }: { plans: Plan[] }) {
  return (
    <Panel>
      <div className="rings">
        {plans.map((plan) => {
          const { metric, achieved, target, remaining, ratio, isComplete } = plan.progress;
          const format = (value: number) =>
            metric === 'REVENUE' ? formatMinor(Math.round(value)) : Math.round(value).toLocaleString('ru-RU');

          return (
            <RingMeter
              key={plan.id}
              ratio={ratio}
              complete={isComplete}
              label={PLAN_METRIC_LABELS[metric]}
              caption={isComplete ? `выполнен · ${format(achieved)}` : `ещё ${format(remaining)} из ${format(target)}`}
            />
          );
        })}
      </div>
    </Panel>
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

/** Первая тройка — медальным цветом, своя строка — акцентом. */
function EntryRow({ entry, isSelf }: { entry: RankedEntry; isSelf: boolean }) {
  const medal = MEDALS[entry.rank];

  return (
    <PanelRow
      title={isSelf ? `${entry.fullName} · вы` : entry.fullName}
      subtitle={medal ? `${entry.rank} место` : undefined}
      accent={isSelf ? tone.accent : medal}
      trailing={
        <span>
          {!medal && !isSelf ? <span className="rank">{entry.rank}</span> : null}
          <RowValue color={isSelf ? tone.accent : undefined}>{entry.points}</RowValue>
        </span>
      }
    />
  );
}

/**
 * Тройка лидеров на пьедестале: второй, первый, третий — как на
 * награждении. Место подписано числом, а не только цветом медали.
 */
function Podium({ entries, selfId }: { entries: RankedEntry[]; selfId?: string }) {
  const order = [entries[1], entries[0], entries[2]].filter((entry): entry is RankedEntry => Boolean(entry));

  return (
    <div className="podium">
      {order.map((entry) => (
        <div
          key={entry.userId}
          className={`podium-place is-rank-${Math.min(entry.rank, 3)} ${entry.userId === selfId ? 'is-self' : ''}`}
        >
          <div className="podium-avatar" style={{ borderColor: MEDALS[entry.rank] ?? 'var(--border)' }}>
            {initialsOf(entry.fullName)}
          </div>
          <div className="podium-name">
            {entry.userId === selfId ? 'Вы' : entry.fullName.split(' ')[0]}
          </div>
          <div className="podium-points">{entry.points}</div>
          <div className="podium-step">{entry.rank}</div>
        </div>
      ))}
    </div>
  );
}
