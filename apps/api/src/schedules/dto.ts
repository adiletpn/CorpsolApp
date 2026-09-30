import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Время в формате «ЧЧ:мм», 24 часа. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Допуск на опоздание. Больше часа означает, что график перестаёт
 * что-либо значить: приход в 10:01 при смене с 09:00 считался бы вовремя.
 */
const MAX_GRACE_MINUTES = 60;

export class CreateScheduleDto {
  /** Отдел. Взаимоисключим с userId: график либо общий, либо личный. */
  @IsOptional()
  @IsString()
  departmentId?: string;

  /** Сотрудник. Личный график имеет приоритет над отдельским. */
  @IsOptional()
  @IsString()
  userId?: string;

  @Matches(TIME, { message: 'startTime должен быть в формате ЧЧ:мм' })
  startTime!: string;

  @Matches(TIME, { message: 'endTime должен быть в формате ЧЧ:мм' })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GRACE_MINUTES)
  graceMinutes?: number;

  /** Дни недели: 1 — понедельник … 7 — воскресенье. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workdays!: number[];

  /**
   * С какого момента график действует. Без указания — с начала текущего года,
   * чтобы правка табеля за прошедшие дни находила график и могла определить
   * опоздание.
   */
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}
