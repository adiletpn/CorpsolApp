import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PLAN_METRICS, type PlanMetric } from '@corpsol/shared';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const RULE_KINDS = [
  'PLAN_COMPLETION',
  'PER_UNIT',
  'ATTENDANCE',
  'LATE_PENALTY',
  'ABSENCE_PENALTY',
] as const;

export class CreateBonusRuleDto {
  @IsIn(RULE_KINDS)
  kind!: (typeof RULE_KINDS)[number];

  /** Обязательна для правил, привязанных к плану. */
  @IsOptional()
  @IsIn(PLAN_METRICS)
  metric?: PlanMetric;

  /** Пусто — правило действует на всю компанию. */
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsInt()
  @Min(0)
  threshold!: number;

  @IsInt()
  @Min(0)
  amountMinor!: number;

  /** Доля от оклада в базисных пунктах. 10 000 = 100%, больше бессмысленно. */
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentBps!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CalculatePayrollDto {
  @Matches(DATE_KEY, { message: 'periodStart должен быть в формате ГГГГ-ММ-ДД' })
  periodStart!: string;

  @Matches(DATE_KEY, { message: 'periodEnd должен быть в формате ГГГГ-ММ-ДД' })
  periodEnd!: string;

  /** Пусто — считаем всем сотрудникам, доступным по роли. */
  @IsOptional()
  @IsString()
  userId?: string;
}
