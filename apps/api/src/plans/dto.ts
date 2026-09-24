import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PLAN_METRICS, type PlanMetric, type PlanScope } from '@corpsol/shared';

/** Календарная дата «ГГГГ-ММ-ДД»: в таком виде она входит в ключ документа. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePlanDto {
  @IsIn(['DEPARTMENT', 'USER'])
  scope!: PlanScope;

  /** Отдел или сотрудник — в зависимости от области плана. */
  @IsString()
  ownerId!: string;

  @IsIn(PLAN_METRICS)
  metric!: PlanMetric;

  /** Для REVENUE — сумма в тиынах, для остальных метрик штуки или минуты. */
  @IsInt()
  @Min(0)
  target!: number;

  @Matches(DATE_KEY, { message: 'periodStart должен быть в формате ГГГГ-ММ-ДД' })
  periodStart!: string;

  @Matches(DATE_KEY, { message: 'periodEnd должен быть в формате ГГГГ-ММ-ДД' })
  periodEnd!: string;
}

export class ListPlansQueryDto {
  @IsOptional()
  @Matches(DATE_KEY)
  periodStart?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
