import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

/** Ранг в таблице. Суммы — в тиынах, целые. */
export class GradeTierDto {
  @IsString()
  @Matches(/^[A-Z]{1,3}\d?$/, { message: 'Код ранга — латинские буквы: A, B, C' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name!: string;

  @IsInt()
  @Min(0)
  baseSalaryMinor!: number;

  @IsInt()
  @Min(1)
  monthPlan!: number;

  @IsInt()
  @Min(1)
  weekPlan!: number;

  @IsInt()
  @Min(0)
  rateUnderMinor!: number;

  @IsInt()
  @Min(0)
  ratePlanMinor!: number;

  @IsInt()
  @Min(0)
  rateOverMinor!: number;
}

export class UpdateGradesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GradeTierDto)
  tiers!: GradeTierDto[];
}

export class AssignGradeDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class AddAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @Matches(/^\d{4}-\d{2}-01$/, { message: 'Период — первое число месяца, ГГГГ-ММ-01' })
  periodStart!: string;

  /** Плюс — доплата, минус — удержание; в тиынах. */
  @IsInt()
  @Min(-100_000_000_00)
  @Max(100_000_000_00)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
