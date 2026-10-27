import React from 'react';

import { api, type RankedEntry } from '../api';
import { monthRange } from '../format';
import { PeriodScreen } from '../PeriodScreen';
import { useSession } from '../session';
import { Gap, HeroFigure, Panel, PanelRow, RowValue, SectionLabel, tone } from '../ui';

const MEDALS: Record<number, string> = { 1: '#FFC53D', 2: '#A8AEBF', 3: '#CD7F32' };

export function Leaderboard() {
  const { user } = useSession();
  const month = monthRange();

  return (
    <PeriodScreen
      title="Рейтинг"
      subtitle="Баллы отдела за месяц"
      load={() => api.leaderboard(month.from, month.to)}
      isEmpty={(board) => board.entries.length === 0}
      emptyMessage="За этот месяц баллов ещё никто не набрал"
      emptyIcon="leaderboard"
    >
      {(board) => (
        <>
          {board.self ? (
            <>
              <HeroFigure
                label="Ваше место"
                value={String(board.self.rank)}
                caption={
                  board.self.pointsBehindLeader === 0
                    ? `${board.self.points} баллов — вы впереди всех`
                    : `${board.self.points} баллов · до первого места ${board.self.pointsBehindLeader}`
                }
                icon="leaderboard"
              />
              <Gap size={3} />
            </>
          ) : null}
          <SectionLabel>Отдел за месяц</SectionLabel>
          <Panel>
            {board.entries.map((entry) => (
              <EntryRow key={entry.userId} entry={entry} isSelf={entry.userId === user?.id} />
            ))}
          </Panel>
        </>
      )}
    </PeriodScreen>
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
