import React from 'react';

import { api, type Achievement } from '../api';
import { formatDate } from '../format';
import { PeriodScreen } from '../PeriodScreen';
import { Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

export function Achievements() {
  return (
    <PeriodScreen
      title="Награды"
      subtitle="Полученные и то, к чему можно стремиться"
      load={api.achievements}
      isEmpty={(items) => items.length === 0}
      emptyMessage="Награды появятся, когда начнёте выполнять план"
      emptyIcon="emoji_events"
    >
      {(items) => {
        const unlocked = items.filter((item) => item.unlockedAt);
        const goals = items.filter((item) => !item.unlockedAt);
        const points = unlocked.reduce((sum, item) => sum + item.points, 0);

        return (
          <>
            <HeroFigure
              label="Получено наград"
              value={`${unlocked.length} из ${items.length}`}
              caption={`${points} баллов набрано`}
              icon="emoji_events"
            />
            {unlocked.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel>Получены</SectionLabel>
                <Panel>
                  {unlocked.map((item) => (
                    <AwardRow key={item.code} item={item} />
                  ))}
                </Panel>
              </>
            ) : null}
            {goals.length > 0 ? (
              <>
                <Gap size={3} />
                <SectionLabel>Ещё впереди</SectionLabel>
                <Panel>
                  {goals.map((item) => (
                    <AwardRow key={item.code} item={item} />
                  ))}
                </Panel>
              </>
            ) : null}
          </>
        );
      }}
    </PeriodScreen>
  );
}

/** Полученная — золотом, цель остаётся спокойной: иначе список целей читается как список провалов. */
function AwardRow({ item }: { item: Achievement }) {
  const unlocked = Boolean(item.unlockedAt);

  return (
    <PanelRow
      title={item.title}
      subtitle={unlocked ? `Получено ${formatDate(item.unlockedAt!)}` : item.description}
      accent={unlocked ? tone.warning : undefined}
      trailing={
        <RowValue color={unlocked ? tone.warning : undefined} muted={!unlocked}>
          +{item.points}
        </RowValue>
      }
    />
  );
}
