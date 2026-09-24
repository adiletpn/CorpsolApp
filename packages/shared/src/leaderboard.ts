/**
 * Рейтинг сотрудников по игровым очкам.
 *
 * В лидерборд намеренно попадают только очки и имя: оклады, премии и планы
 * остаются личными данными. Сравнение нужно для соревнования, а не для того,
 * чтобы отдел знал, кто сколько зарабатывает.
 */

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  points: number;
  /** Разбивка очков по причинам — чтобы было видно, за что они начислены. */
  breakdown?: Record<string, number>;
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number;
  /** Отставание от первого места в очках. Ноль у лидера. */
  pointsBehindLeader: number;
}

/**
 * Расставляет места. При равных очках место общее, а следующее за ними
 * сдвигается на число разделивших: 1, 2, 2, 4.
 *
 * Иначе двое с одинаковым результатом получали бы разные места по порядку
 * в массиве — то есть по случайности выборки из базы, — и рейтинг
 * воспринимался бы как несправедливый.
 */
export function rankEntries(entries: LeaderboardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // При равенстве очков порядок должен быть устойчивым, а не случайным.
    return a.fullName.localeCompare(b.fullName, 'ru');
  });

  const leaderPoints = sorted[0]?.points ?? 0;

  let previousPoints: number | null = null;
  let previousRank = 0;

  return sorted.map((entry, index) => {
    const rank = entry.points === previousPoints ? previousRank : index + 1;

    previousPoints = entry.points;
    previousRank = rank;

    return {
      ...entry,
      rank,
      pointsBehindLeader: Math.max(0, leaderPoints - entry.points),
    };
  });
}

/** Место конкретного сотрудника — для личного экрана. */
export function findRank(ranked: RankedEntry[], userId: string): RankedEntry | null {
  return ranked.find((entry) => entry.userId === userId) ?? null;
}

/**
 * Верхушка рейтинга плюс сам сотрудник, если он в неё не попал.
 * Показывать человеку только первую тройку бессмысленно: он не видит
 * ни своего места, ни того, сколько до следующего.
 */
export function topWithSelf(
  ranked: RankedEntry[],
  userId: string,
  topSize = 5,
): RankedEntry[] {
  const top = ranked.slice(0, topSize);
  if (top.some((entry) => entry.userId === userId)) return top;

  const self = findRank(ranked, userId);
  return self ? [...top, self] : top;
}
