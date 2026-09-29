import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CheckInDto {
  /** Сырая строка из QR-кода терминала. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  qr!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsNumber()
  @Min(0)
  accuracyMeters!: number;

  /** Android сообщает о включённом fake-GPS; iOS такого флага не даёт. */
  @IsOptional()
  @IsBoolean()
  isMocked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  wifiBssid?: string;

  @IsISO8601()
  capturedAt!: string;
}

export class CheckOutDto {
  @IsISO8601()
  capturedAt!: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const ADJUSTABLE_STATUSES = ['ON_TIME', 'LATE', 'ABSENT', 'DAY_OFF', 'EXCUSED'] as const;

export class AdjustAttendanceDto {
  /** Календарная дата смены «ГГГГ-ММ-ДД». */
  @Matches(DATE_KEY, { message: 'workDate должен быть в формате ГГГГ-ММ-ДД' })
  workDate!: string;

  /** Время прихода. Пусто — сотрудник в этот день не работал. */
  @IsOptional()
  @IsISO8601()
  checkInAt?: string;

  /**
   * Желаемый статус. Опоздание всё равно пересчитывается по графику:
   * поставить «вовремя» при позднем приходе нельзя.
   */
  @IsOptional()
  @IsIn(ADJUSTABLE_STATUSES)
  status?: (typeof ADJUSTABLE_STATUSES)[number];

  /**
   * Причина обязательна: ручная правка обходит контроль прихода,
   * и она должна быть объяснима при разборе.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
