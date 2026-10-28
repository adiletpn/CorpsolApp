/**
 * Ранги менеджеров и недельные бонусы за регистрации.
 *
 * Ранг задаёт оклад и ставку за регистрацию. Бонус считается по неделям:
 * ставка зависит от того, выполнен ли недельный план — ниже плана,
 * ровно план или сверх плана. Ранг на следующий месяц выставляется
 * по итогу текущего: больше регистраций за месяц — выше ранг.
 *
 * Цифры по умолчанию — из таблицы учредителя («Новая система»), но
 * хранятся в настройках организации и меняются без правки кода.
 */

export interface GradeTier {
  /** Код ранга: A, B, C. */
  code: string;
  /** Как ранг называется в таблице: «А», «Б», «С». */
  name: string;
  baseSalaryMinor: number;
  /** Регистраций за месяц, чтобы получить этот ранг. */
  monthPlan: number;
  /** Регистраций за неделю — недельный план. */
  weekPlan: number;
  /** Ставка за регистрацию в неделю ниже плана. */
  rateUnderMinor: number;
  /** Ставка в неделю, где план выполнен ровно. */
  ratePlanMinor: number;
  /** Ставка в неделю сверх плана. */
  rateOverMinor: number;
}

/** Таблица «Новая система», суммы в тиынах. Ранги — от младшего к старшему. */
export const DEFAULT_GRADE_TIERS: GradeTier[] = [
  {
    code: 'A',
    name: 'А',
    baseSalaryMinor: 100_000_00,
    monthPlan: 25,
    weekPlan: 6,
    rateUnderMinor: 4_500_00,
    ratePlanMinor: 5_000_00,
    rateOverMinor: 5_500_00,
  },
  {
    code: 'B',
    name: 'Б',
    baseSalaryMinor: 120_000_00,
    monthPlan: 30,
    weekPlan: 7,
    rateUnderMinor: 7_500_00,
    ratePlanMinor: 8_000_00,
    rateOverMinor: 8_500_00,
  },
  {
    code: 'C',
    name: 'С',
    baseSalaryMinor: 150_000_00,
    monthPlan: 40,
    weekPlan: 10,
    rateUnderMinor: 8_500_00,
    ratePlanMinor: 9_000_00,
    rateOverMinor: 10_000_00,
  },
];

export type WeekBand = 'under' | 'plan' | 'over';

export const WEEK_BAND_LABELS: Record<WeekBand, string> = {
  under: 'ниже плана',
  plan: 'план',
  over: 'сверх плана',
};

export interface WeekBonus {
  band: WeekBand;
  rateMinor: number;
  /** Регистраций, за которые платится в этом месяце. */
  paidCount: number;
  amountMinor: number;
}

/**
 * Бонус за неделю. Полоса (ниже плана, план, сверх) решается по всем
 * регистрациям недели, а платится за те, что попали в рассчитываемый
 * месяц: неделя на стыке месяцев делится, но ставка у неё одна.
 *
 * Ставка — на все регистрации недели, а не только на сверхплановые:
 * 8 при плане 6 у ранга А — это 8 × 5 500.
 */
export function weekBonus(tier: GradeTier, weekCount: number, paidCount = weekCount): WeekBonus {
  const band: WeekBand = weekCount > tier.weekPlan ? 'over' : weekCount === tier.weekPlan ? 'plan' : 'under';
  const rateMinor = band === 'over' ? tier.rateOverMinor : band === 'plan' ? tier.ratePlanMinor : tier.rateUnderMinor;
  const count = Math.max(0, paidCount);

  return { band, rateMinor, paidCount: count, amountMinor: count * rateMinor };
}

/**
 * Ранг по итогу месяца: старший, чей месячный план достигнут. Меньше
 * плана младшего — остаётся младший: ниже «А» ранга нет.
 */
export function gradeForMonth(tiers: GradeTier[], monthCount: number): GradeTier {
  const ordered = [...tiers].sort((a, b) => a.monthPlan - b.monthPlan);
  let result = ordered[0];
  for (const tier of ordered) {
    if (monthCount >= tier.monthPlan) result = tier;
  }
  return result;
}

export interface CalendarWeek {
  /** Понедельник, «ГГГГ-ММ-ДД». */
  start: string;
  /** Воскресенье. */
  end: string;
}

const pad = (value: number) => String(value).padStart(2, '0');
const key = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/**
 * Недели пн–вс, задевающие месяц, — включая неделю на стыке с соседним.
 * Даты — календарные ключи без часового пояса.
 */
export function weeksTouchingMonth(year: number, month: number): CalendarWeek[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  // Понедельник недели, в которую попадает первое число.
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));

  const weeks: CalendarWeek[] = [];
  for (let start = monday; start <= last; start = new Date(start.getTime() + 7 * 86_400_000)) {
    const end = new Date(start.getTime() + 6 * 86_400_000);
    weeks.push({ start: key(start), end: key(end) });
  }
  return weeks;
}
