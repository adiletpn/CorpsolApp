import {
  IsBoolean,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
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
