import { calculateProgress, paceRatio, progressPercent } from '@corpsol/shared';

describe('выполнение плана', () => {
  it('считает долю и остаток', () => {
    const progress = calculateProgress('CALLS', 200, 150);

    expect(progress.ratio).toBeCloseTo(0.75);
    expect(progress.remaining).toBe(50);
    expect(progress.isComplete).toBe(false);
    expect(progressPercent(progress)).toBe(75);
  });

  it('показывает перевыполнение как есть — оно нужно для бонусов', () => {
    const progress = calculateProgress('OFFERS', 10, 13);

    expect(progressPercent(progress)).toBe(130);
    expect(progress.isComplete).toBe(true);
    // Остаток не уходит в минус: «не хватает минус три» бессмысленно.
    expect(progress.remaining).toBe(0);
  });

  it('считает нулевой план закрытым, а не делит на ноль', () => {
    const progress = calculateProgress('REVENUE', 0, 0);

    expect(Number.isFinite(progress.ratio)).toBe(true);
    expect(progress.isComplete).toBe(true);
  });

  it('не принимает отрицательные значения', () => {
    const progress = calculateProgress('CALLS', -5, -10);

    expect(progress.target).toBe(0);
    expect(progress.achieved).toBe(0);
  });
});

describe('темп относительно графика периода', () => {
  const half = calculateProgress('CALLS', 100, 40);

  it('считает отставанием 40% плана к середине месяца', () => {
    expect(paceRatio(half, 15, 30)).toBeCloseTo(0.8);
  });

  it('считает опережением те же 40% к пятому дню', () => {
    expect(paceRatio(half, 5, 30)).toBeCloseTo(2.4);
  });

  it('в первый день отставания ещё нет', () => {
    expect(paceRatio(calculateProgress('CALLS', 100, 0), 0, 30)).toBe(1);
  });

  it('не выходит за границы периода', () => {
    const complete = calculateProgress('CALLS', 100, 100);
    expect(paceRatio(complete, 90, 30)).toBeCloseTo(1);
  });
});
