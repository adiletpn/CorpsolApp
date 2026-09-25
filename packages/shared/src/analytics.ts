import type { AttendanceSummary } from './payroll';

/**
 * Сводные показатели. Считаются из уже собранных счётчиков, поэтому
 * функции чистые: их можно проверить тестами и переиспользовать
 * и на сервере, и в клиентах.
 */

export interface AttendanceRates {
  /** Дней, когда сотрудник пришёл: вовремя или с опозданием. */
  presentDays: number;
  /** Дней, которые должны были быть рабочими. */
  expectedDays: number;

  /**
   * Доля дней, когда сотрудник вообще пришёл. Отвечает на вопрос
   * «ходит ли человек на работу».
   */
  attendanceRate: number;

  /**
   * Доля прихода вовремя среди дней, когда он пришёл. Отвечает
   * на другой вопрос — «приходит ли вовремя, когда приходит».
   *
   * Метрики намеренно раздельные: без прогулов, но с постоянными
   * опозданиями и наоборот — разные проблемы, и одна цифра их скрыла бы.
   */
  punctualityRate: number;

  /** Среднее опоздание в минутах среди опоздавших дней. */
  averageLateMinutes: number;
}

export function calculateAttendanceRates(summary: AttendanceSummary): AttendanceRates {
  const presentDays = summary.onTimeDays + summary.lateDays;
  const expectedDays = presentDays + summary.absentDays;

  return {
    presentDays,
    expectedDays,
    // Нет рабочих дней — считаем показатель идеальным, а не делим на ноль.
    attendanceRate: expectedDays === 0 ? 1 : presentDays / expectedDays,
    punctualityRate: presentDays === 0 ? 1 : summary.onTimeDays / presentDays,
    averageLateMinutes:
      summary.lateDays === 0 ? 0 : Math.round(summary.totalLateMinutes / summary.lateDays),
  };
}

/** Складывает счётчики нескольких сотрудников в сводку по отделу. */
export function mergeAttendance(summaries: AttendanceSummary[]): AttendanceSummary {
  return summaries.reduce<AttendanceSummary>(
    (total, item) => ({
      onTimeDays: total.onTimeDays + item.onTimeDays,
      lateDays: total.lateDays + item.lateDays,
      absentDays: total.absentDays + item.absentDays,
      totalLateMinutes: total.totalLateMinutes + item.totalLateMinutes,
    }),
    { onTimeDays: 0, lateDays: 0, absentDays: 0, totalLateMinutes: 0 },
  );
}

/** Доля в процентах для показа. */
export function ratePercent(rate: number): number {
  return Math.round(rate * 100);
}

export interface RiskFlag {
  code: 'FREQUENT_LATE' | 'ABSENTEEISM' | 'PLAN_BEHIND';
  severity: 'warning' | 'critical';
  message: string;
}

/**
 * Что в показателях требует вмешательства руководителя.
 *
 * Дашборд, который показывает только цифры, требует от РОПа самому
 * замечать проблему в таблице на тридцать человек. Признаки выносим явно.
 */
export function detectRisks(
  rates: AttendanceRates,
  planRatio: number | null,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (rates.presentDays >= 5 && rates.punctualityRate < 0.7) {
    flags.push({
      code: 'FREQUENT_LATE',
      severity: rates.punctualityRate < 0.5 ? 'critical' : 'warning',
      message: `Приходит вовремя лишь в ${ratePercent(rates.punctualityRate)}% случаев`,
    });
  }

  if (rates.expectedDays >= 5 && rates.attendanceRate < 0.8) {
    flags.push({
      code: 'ABSENTEEISM',
      severity: rates.attendanceRate < 0.6 ? 'critical' : 'warning',
      message: `Пропущено ${rates.expectedDays - rates.presentDays} из ${rates.expectedDays} смен`,
    });
  }

  if (planRatio !== null && planRatio < 0.7) {
    flags.push({
      code: 'PLAN_BEHIND',
      severity: planRatio < 0.5 ? 'critical' : 'warning',
      message: `План выполнен на ${ratePercent(planRatio)}%`,
    });
  }

  return flags;
}
