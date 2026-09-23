import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Радиус меньше этого делает геозону неработоспособной: GPS в помещении
 * ошибается на 20–50 метров, и отметку не засчитало бы никому, даже
 * сотруднику, стоящему вплотную к терминалу.
 */
export const MIN_RADIUS_METERS = 50;

/** Радиус больше этого перестаёт быть контролем: накрывает соседние кварталы. */
export const MAX_RADIUS_METERS = 1000;

export const MIN_ACCURACY_METERS = 20;
export const MAX_ACCURACY_METERS = 300;

export class CreateOfficeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsInt()
  @Min(MIN_RADIUS_METERS)
  @Max(MAX_RADIUS_METERS)
  radiusMeters!: number;

  /** Координаты с погрешностью хуже этой считаем недостоверными. */
  @IsOptional()
  @IsInt()
  @Min(MIN_ACCURACY_METERS)
  @Max(MAX_ACCURACY_METERS)
  maxAccuracyMeters?: number;

  /** Пустой список отключает проверку по Wi-Fi для офиса. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  wifiBssids?: string[];
}

export class UpdateOfficeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_RADIUS_METERS)
  @Max(MAX_RADIUS_METERS)
  radiusMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_ACCURACY_METERS)
  @Max(MAX_ACCURACY_METERS)
  maxAccuracyMeters?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  wifiBssids?: string[];
}
