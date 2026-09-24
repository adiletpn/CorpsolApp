import { findRank, rankEntries, topWithSelf } from '@corpsol/shared';

const entry = (userId: string, fullName: string, points: number) => ({
  userId,
  fullName,
  points,
});

describe('расстановка мест', () => {
  it('сортирует по убыванию очков', () => {
    const ranked = rankEntries([
      entry('b', 'Борис', 50),
      entry('a', 'Асель', 90),
      entry('c', 'Ерлан', 70),
    ]);

    expect(ranked.map((item) => item.userId)).toEqual(['a', 'c', 'b']);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it('даёт одинаковое место при равных очках', () => {
    const ranked = rankEntries([
      entry('a', 'Асель', 90),
      entry('b', 'Борис', 70),
      entry('c', 'Ерлан', 70),
      entry('d', 'Дана', 50),
    ]);

    // Двое делят второе место, следующий получает четвёртое, а не третье.
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 2, 4]);
  });

  it('при равных очках сохраняет устойчивый порядок', () => {
    const first = rankEntries([entry('c', 'Ерлан', 70), entry('b', 'Борис', 70)]);
    const second = rankEntries([entry('b', 'Борис', 70), entry('c', 'Ерлан', 70)]);

    // Порядок не должен зависеть от того, как база вернула записи.
    expect(first.map((item) => item.userId)).toEqual(second.map((item) => item.userId));
  });

  it('считает отставание от лидера', () => {
    const ranked = rankEntries([entry('a', 'Асель', 90), entry('b', 'Борис', 70)]);

    expect(ranked[0].pointsBehindLeader).toBe(0);
    expect(ranked[1].pointsBehindLeader).toBe(20);
  });

  it('не падает на пустом рейтинге', () => {
    expect(rankEntries([])).toEqual([]);
  });
});

describe('личный срез рейтинга', () => {
  const ranked = rankEntries([
    entry('a', 'Асель', 100),
    entry('b', 'Борис', 90),
    entry('c', 'Ерлан', 80),
    entry('d', 'Дана', 70),
    entry('e', 'Ержан', 60),
    entry('f', 'Фарида', 10),
  ]);

  it('находит место сотрудника', () => {
    expect(findRank(ranked, 'c')?.rank).toBe(3);
    expect(findRank(ranked, 'нет-такого')).toBeNull();
  });

  it('добавляет сотрудника к верхушке, если он в неё не попал', () => {
    const view = topWithSelf(ranked, 'f', 3);

    expect(view).toHaveLength(4);
    // Человек должен видеть своё место, а не только чужие достижения.
    expect(view[view.length - 1].userId).toBe('f');
  });

  it('не дублирует сотрудника, уже попавшего в верхушку', () => {
    const view = topWithSelf(ranked, 'a', 3);

    expect(view).toHaveLength(3);
    expect(view.filter((item) => item.userId === 'a')).toHaveLength(1);
  });
});
