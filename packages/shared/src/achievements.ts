import type { AttendanceSummary } from './payroll';
import type { PlanProgress } from './plans';

/**
 * Ачивки — видимая часть геймификации. Условия вынесены в чистые функции,
 * чтобы их можно было проверить тестами и показать сотруднику одинаково
 * и в приложении, и в панели.
 */

export const ACHIEVEMENT_CODES = [
  'PUNCTUAL_WEEK',
  'PERFECT_MONTH',
  'PLAN_CRUSHER',
  'OVERACHIEVER',
  'DEAL_MAKER',
] as const;

export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export interface AchievementDefinition {
  code: AchievementCode;
  title: string;
  description: string;
  points: number;
}

export const ACHIEVEMENTS: Record<AchievementCode, AchievementDefinition> = {
  PUNCTUAL_WEEK: {
    code: 'PUNCTUAL_WEEK',
    title: 'Неделя без опозданий',
    description: 'Пять смен подряд вовремя',
    points: 50,
  },
  PERFECT_MONTH: {
    code: 'PERFECT_MONTH',
    title: 'Месяц без замечаний',
    description: 'Ни одного опоздания и прогула за период',
    points: 150,
  },
  PLAN_CRUSHER: {
    code: 'PLAN_CRUSHER',
    title: 'План закрыт',
    description: 'Личный план выполнен полностью',
    points: 120,
  },
  OVERACHIEVER: {
    code: 'OVERACHIEVER',
    title: 'Сверх плана',
    description: 'Личный план перевыполнен в полтора раза',
    points: 200,
  },
  DEAL_MAKER: {
    code: 'DEAL_MAKER',
    title: 'Десять сделок',
    description: 'Десять подтверждённых сделок за период',
    points: 180,
  },
};

export interface AchievementContext {
  attendance: AttendanceSummary;
  planProgress: PlanProgress[];
  acceptedOffers: number;
}

/** Минимум смен, ниже которого о пунктуальности говорить рано. */
const MIN_DAYS_FOR_PUNCTUALITY = 5;

const OVERACHIEVE_RATIO = 1.5;
const DEAL_MAKER_TARGET = 10;

/**
 * Какие ачивки заслужены по текущим показателям.
 *
 * Функция возвращает полный список заслуженных, а не только новые:
 * решение о том, что уже выдано, принимает вызывающая сторона по базе.
 * Так расчёт остаётся чистым и предсказуемым.
 */
export function earnedAchievements(context: AchievementContext): AchievementCode[] {
  const earned: AchievementCode[] = [];
  const { attendance, planProgress, acceptedOffers } = context;

  const workedDays = attendance.onTimeDays + attendance.lateDays;

  // Неделя без опозданий: пять смен подряд не отследить по сводке,
  // поэтому засчитываем пять отработанных смен без единого опоздания.
  if (workedDays >= MIN_DAYS_FOR_PUNCTUALITY && attendance.lateDays === 0) {
    earned.push('PUNCTUAL_WEEK');
  }

  // Месяц без замечаний требует ещё и отсутствия прогулов.
  if (
    workedDays >= MIN_DAYS_FOR_PUNCTUALITY * 4 &&
    attendance.lateDays === 0 &&
    attendance.absentDays === 0
  ) {
    earned.push('PERFECT_MONTH');
  }

  // Ачивки за план выдаём, только если план вообще поставлен:
  // иначе «нулевой план закрыт» присваивал бы их всем подряд.
  const meaningfulPlans = planProgress.filter((plan) => plan.target > 0);

  if (meaningfulPlans.length > 0) {
    if (meaningfulPlans.every((plan) => plan.isComplete)) {
      earned.push('PLAN_CRUSHER');
    }
    if (meaningfulPlans.every((plan) => plan.ratio >= OVERACHIEVE_RATIO)) {
      earned.push('OVERACHIEVER');
    }
  }

  if (acceptedOffers >= DEAL_MAKER_TARGET) {
    earned.push('DEAL_MAKER');
  }

  return earned;
}

/** Сколько очков приносит набор ачивок. */
export function achievementPoints(codes: AchievementCode[]): number {
  return codes.reduce((total, code) => total + ACHIEVEMENTS[code].points, 0);
}
