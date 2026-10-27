import React from 'react';

import { api } from '../api';
import { initials, monthRange, monthTitle, plural } from '../format';
import { MedalIcon } from '../icons';
import { useSession } from '../session';
import { Card, Empty, LoadError, ScreenTitle, Skeleton } from '../ui';
import { useLoad } from '../useLoad';

export function Rating() {
  const { user } = useSession();
  const month = monthRange();

  const data = useLoad(async () => {
    const [board, achievements] = await Promise.all([
      api.leaderboard(month.from, month.to),
      api.achievements(),
    ]);
    return { board, achievements };
  });

  const self = data.data?.board.self ?? null;

  return (
    <>
      <ScreenTitle title="Рейтинг" subtitle={monthTitle()} />

      {data.error ? <LoadError message={data.error} onRetry={data.reload} /> : null}
      {data.loading && !data.data ? <Skeleton lines={5} /> : null}

      {data.data ? (
        <>
          {self ? (
            <Card className="hero rank-hero">
              <div className="rank-place">#{self.rank}</div>
              <div>
                <div className="rank-points">
                  {self.points} {plural(self.points, 'очко', 'очка', 'очков')}
                </div>
                <div className="muted small">
                  {self.pointsBehindLeader === 0 ? 'Вы лидер месяца' : `До лидера ${self.pointsBehindLeader}`}
                </div>
              </div>
            </Card>
          ) : null}

          <Card title="Таблица">
            {data.data.board.entries.length === 0 ? (
              <Empty>Очки начисляются за приход вовремя, звонки и сделки.</Empty>
            ) : (
              <ol className="leaderboard">
                {data.data.board.entries.map((entry) => (
                  <li key={entry.userId} className={entry.userId === user?.id ? 'is-self' : ''}>
                    <span className={`place place-${entry.rank}`}>{entry.rank}</span>
                    <span className="avatar avatar-small">{initials(entry.fullName)}</span>
                    <span className="leader-name">{entry.fullName}</span>
                    <span className="leader-points">{entry.points}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Награды">
            <div className="achievements">
              {data.data.achievements.map((achievement) => (
                <div key={achievement.code} className={`achievement ${achievement.unlockedAt ? 'is-unlocked' : ''}`}>
                  <div className="achievement-icon">
                    <MedalIcon />
                  </div>
                  <div className="achievement-title">{achievement.title}</div>
                  <div className="achievement-text">{achievement.description}</div>
                  <div className="achievement-points">+{achievement.points}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
