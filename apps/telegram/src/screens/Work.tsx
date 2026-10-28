import { PLAN_METRIC_LABELS } from '@corpsol/shared';
import React, { useCallback, useState } from 'react';

import { api, type Plan, type RankedEntry } from '../api';
import { formatMoneyShort, initialsOf, monthRange, percent } from '../format';
import { RingMeter } from '../charts';
import { PeriodScreen } from '../PeriodScreen';
import { SectionNav } from '../SectionNav';
import { CallsJournal } from './CallsJournal';
import { useSession } from '../session';
import { Figure, FigureRow, Gap, HeroFigure, Icon, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

/** Медальные цвета первой тройки — как во Flutter. */
const MEDALS: Record<number, string> = { 1: '#FFC53D', 2: '#A8AEBF', 3: '#CD7F32' };

export function Work() {
  const [journal, setJournal] = useState(false);
  const openJournal = useCallback(() => setJournal(true), []);
  const closeJournal = useCallback(() => setJournal(false), []);

  if (journal) return <CallsJournal onClose={closeJournal} />;
  return <WorkOverview onOpenJournal={openJournal} />;
}

function WorkOverview({ onOpenJournal }: { onOpenJournal(): void }) {
  const { user } = useSession();
  const month = monthRange();

  return (
    <PeriodScreen
      title="Работа"
      subtitle="Планы, рейтинг отдела и звонки за месяц"
      load={async () => {
        // Журнал звонков грузит своя «папка» — здесь хватает сводки.
        const [plans, summary, board] = await Promise.all([
          api.plans(month.from),
          api.callsSummary(month.from, month.to),
          api.leaderboard(month.from, month.to),
        ]);
        return { plans, summary, board };
      }}
      emptyMessage="Данных за месяц пока нет"
      emptyIcon="insights"
    >
      {({ plans, summary, board }) => {
        const department = plans.filter((plan) => plan.scope === 'DEPARTMENT');
        const personal = plans.filter((plan) => plan.scope === 'USER');

        return (
          <>
            <SectionNav
              sections={[
                ...(department.length + personal.length > 0 ? [{ id: 'work-plans', label: 'Планы' }] : []),
                ...(board.entries.length > 0 ? [{ id: 'work-rating', label: 'Рейтинг' }] : []),
                { id: 'work-calls', label: 'Звонки' },
              ]}
            />
            <Gap size={1} />
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
                <SectionLabel id="work-plans">План отдела</SectionLabel>
                <PlanRings plans={department} />
              </>
            ) : null}

            {personal.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel id={department.length > 0 ? undefined : 'work-plans'}>Ваш план</SectionLabel>
                <PlanRings plans={personal} />
              </>
            ) : null}

            {board.entries.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel
                  id="work-rating"
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
            <SectionLabel id="work-calls">Звонки</SectionLabel>
            {/* Журнал — «папкой»: длинный список в «Работе» прятал планы
                и рейтинг, а фильтров и поиска здесь всё равно не было. */}
            <Panel>
              <button className="panel-button" onClick={onOpenJournal}>
                <PanelRow
                  leading={
                    <span className="call-icon is-out" aria-hidden="true">
                      <Icon name="call" />
                    </span>
                  }
                  title="Журнал звонков"
                  subtitle={`${summary.total} за месяц · с ответом ${percent(summary.answered, summary.total)}%`}
                  trailing={<Icon name="chevron_right" style={{ color: tone.faint }} />}
                />
              </button>
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
            // В половине ширины полная сумма не помещается — коротко: «1,9 млн ₸».
            metric === 'REVENUE' ? formatMoneyShort(value) : Math.round(value).toLocaleString('ru-RU');

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
export function Podium({ entries, selfId }: { entries: RankedEntry[]; selfId?: string }) {
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
