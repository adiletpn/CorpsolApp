/** Метрики, по которым ставится план. */
export const PLAN_METRICS = ['CALLS', 'TALK_MINUTES', 'OFFERS', 'REVENUE'] as const;
export type PlanMetric = (typeof PLAN_METRICS)[number];

export const PLAN_METRIC_LABELS: Record<PlanMetric, string> = {
  CALLS: 'Звонки',
  TALK_MINUTES: 'Минуты разговора',
  OFFERS: 'Офферы',
  REVENUE: 'Выручка',
};

export type PlanScope = 'DEPARTMENT' | 'USER';

export interface PlanProgress {
  metric: PlanMetric;
  target: number;
  achieved: number;
  /** Доля выполнения: 0.75 = план закрыт на 75%. */
  ratio: number;
  /** Сколько не хватает до плана. Ноль, если план закрыт. */
  remaining: number;
  isComplete: boolean;
}

/**
 * Выполнение плана. Отношение не ограничиваем сверху: перевыполнение
 * видно как есть и нужно для расчёта бонусов.
 *
 * Нулевой план считаем закрытым: иначе деление дало бы бесконечность,
 * а «плана нет» и «план не выполнен» — разные вещи.
 */
export function calculateProgress(
  metric: PlanMetric,
  target: number,
  achieved: number,
): PlanProgress {
  const safeTarget = Math.max(0, target);
  const safeAchieved = Math.max(0, achieved);

  const ratio = safeTarget === 0 ? 1 : safeAchieved / safeTarget;

  return {
    metric,
    target: safeTarget,
    achieved: safeAchieved,
    ratio,
    remaining: Math.max(0, safeTarget - safeAchieved),
    isComplete: safeAchieved >= safeTarget,
  };
}

/** Выполнение в процентах, округлённое до целого — для показа в интерфейсе. */
export function progressPercent(progress: PlanProgress): number {
  return Math.round(progress.ratio * 100);
}

/**
 * Темп относительно ожидаемого на текущий день периода.
 * Отвечает на вопрос «идёт ли сотрудник в графике», а не «сколько сделал всего»:
 * 40% плана к середине месяца — это отставание, а к пятому дню — опережение.
 */
export function paceRatio(
  progress: PlanProgress,
  daysElapsed: number,
  daysInPeriod: number,
): number {
  if (daysInPeriod <= 0) return 1;

  const elapsed = Math.min(Math.max(daysElapsed, 0), daysInPeriod);
  const expectedRatio = elapsed / daysInPeriod;

  // В самом начале периода отставания ещё не бывает.
  if (expectedRatio === 0) return 1;

  return progress.ratio / expectedRatio;
}
