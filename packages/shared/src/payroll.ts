import type { PlanMetric, PlanProgress } from './plans';


/**
 * Деньги везде в тиынах — целыми числами.
 *
 * Дробные числа для денег не годятся: 0.1 + 0.2 не равно 0.3, и на тысяче
 * начислений расхождение вылезет в расчётном листе. Все вычисления идут
 * в целых, деление выполняется в последнюю очередь и с явным округлением.
 */

export type BonusRuleKind =
  | 'PLAN_COMPLETION'
  | 'PER_UNIT'
  | 'ATTENDANCE'
  | 'LATE_PENALTY'
  | 'ABSENCE_PENALTY';

export interface BonusRule {
  id: string;
  kind: BonusRuleKind;
  /** Для правил, привязанных к плану. */
  metric?: PlanMetric;
  /**
   * Порог срабатывания: процент выполнения для PLAN_COMPLETION,
   * количество единиц для PER_UNIT, допустимое число опозданий
   * для ATTENDANCE.
   */
  threshold: number;
  /** Фиксированная сумма в тиынах. */
  amountMinor: number;
  /** Либо доля от оклада в базисных пунктах: 500 = 5%. */
  percentBps: number;
}

export interface AttendanceSummary {
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  totalLateMinutes: number;
}

export interface PayrollInput {
  baseSalaryMinor: number;
  attendance: AttendanceSummary;
  planProgress: PlanProgress[];
  rules: BonusRule[];
  /**
   * Предел удержаний как доля оклада в базисных пунктах.
   * По умолчанию половина: удержать у человека больше половины заработка
   * за месяц нельзя, каким бы ни было число опозданий.
   */
  maxDeductionBps?: number;
}

export interface PayrollLine {
  ruleId: string;
  kind: BonusRuleKind;
  title: string;
  amountMinor: number;
}

export interface PayrollResult {
  baseSalaryMinor: number;
  bonusMinor: number;
  /** Начисленные удержания до применения предела. */
  rawPenaltyMinor: number;
  /** Удержания после ограничения — именно эта сумма вычитается. */
  penaltyMinor: number;
  totalMinor: number;
  lines: PayrollLine[];
}

const BPS_DENOMINATOR = 10_000;
const DEFAULT_MAX_DEDUCTION_BPS = 5_000;

/**
 * Доля от суммы в базисных пунктах. Округление половины вверх и всегда
 * в одну сторону: «то вверх, то вниз» даёт разные расчётные листы
 * при одних и тех же данных, и объяснить сотруднику расхождение нечем.
 */
export function applyBps(amountMinor: number, bps: number): number {
  return Math.round((amountMinor * bps) / BPS_DENOMINATOR);
}

function titleFor(rule: BonusRule): string {
  switch (rule.kind) {
    case 'PLAN_COMPLETION':
      return `Выполнение плана (${rule.metric ?? 'общий'}) от ${rule.threshold}%`;
    case 'PER_UNIT':
      return `За единицу (${rule.metric ?? 'общий'})`;
    case 'ATTENDANCE':
      return 'Без опозданий';
    case 'LATE_PENALTY':
      return 'Удержание за опоздания';
    case 'ABSENCE_PENALTY':
      return 'Удержание за прогулы';
  }
}

function bonusForRule(
  rule: BonusRule,
  input: PayrollInput,
): number {
  const { baseSalaryMinor, attendance, planProgress } = input;

  switch (rule.kind) {
    case 'PLAN_COMPLETION': {
      const progress = planProgress.find((item) => item.metric === rule.metric);
      if (!progress) return 0;

      // Сравниваем точную долю, а не округлённый для показа процент:
      // 199 из 200 — это 99,5%, и округление до 100 выплатило бы полную
      // премию за невыполненный план.
      if (progress.ratio * 100 < rule.threshold) return 0;

      return rule.amountMinor + applyBps(baseSalaryMinor, rule.percentBps);
    }

    case 'PER_UNIT': {
      const progress = planProgress.find((item) => item.metric === rule.metric);
      if (!progress) return 0;

      // Платим за фактически сделанное, а не за план: перевыполнение
      // должно приносить больше, иначе стимул заканчивается на сотне процентов.
      return rule.amountMinor * progress.achieved;
    }

    case 'ATTENDANCE':
      return attendance.lateDays <= rule.threshold
        ? rule.amountMinor + applyBps(baseSalaryMinor, rule.percentBps)
        : 0;

    default:
      return 0;
  }
}

function penaltyForRule(rule: BonusRule, input: PayrollInput): number {
  const { baseSalaryMinor, attendance } = input;

  switch (rule.kind) {
    case 'LATE_PENALTY': {
      // Порог — сколько опозданий прощается, дальше каждое стоит денег.
      const punishable = Math.max(0, attendance.lateDays - rule.threshold);
      return punishable * (rule.amountMinor + applyBps(baseSalaryMinor, rule.percentBps));
    }

    case 'ABSENCE_PENALTY':
      return attendance.absentDays * (rule.amountMinor + applyBps(baseSalaryMinor, rule.percentBps));

    default:
      return 0;
  }
}

/**
 * Расчёт за период. Возвращает не только итог, но и построчную расшифровку:
 * сотрудник должен видеть, из чего сложилась сумма, иначе премия
 * воспринимается как произвол, а геймификация не работает.
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const lines: PayrollLine[] = [];

  let bonusMinor = 0;
  let rawPenaltyMinor = 0;

  for (const rule of input.rules) {
    const bonus = bonusForRule(rule, input);
    if (bonus > 0) {
      bonusMinor += bonus;
      lines.push({ ruleId: rule.id, kind: rule.kind, title: titleFor(rule), amountMinor: bonus });
      continue;
    }

    const penalty = penaltyForRule(rule, input);
    if (penalty > 0) {
      rawPenaltyMinor += penalty;
      lines.push({
        ruleId: rule.id,
        kind: rule.kind,
        title: titleFor(rule),
        amountMinor: -penalty,
      });
    }
  }

  const maxDeduction = applyBps(
    input.baseSalaryMinor,
    input.maxDeductionBps ?? DEFAULT_MAX_DEDUCTION_BPS,
  );
  const penaltyMinor = Math.min(rawPenaltyMinor, maxDeduction);

  // Итог не может быть отрицательным: сотрудник не должен компании
  // по результатам месяца, каким бы ни был расчёт.
  const totalMinor = Math.max(0, input.baseSalaryMinor + bonusMinor - penaltyMinor);

  return {
    baseSalaryMinor: input.baseSalaryMinor,
    bonusMinor,
    rawPenaltyMinor,
    penaltyMinor,
    totalMinor,
    lines,
  };
}

/** Форматирование тиынов в тенге для показа: 2_550_000 → «25 500 ₸». */
export function formatMinor(amountMinor: number, currency = '₸'): string {
  const major = Math.round(amountMinor / 100);
  return `${major.toLocaleString('ru-RU')} ${currency}`;
}
