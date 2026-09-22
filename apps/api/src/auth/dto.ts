import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class DeviceDescriptorDto {
  /** Стабильный идентификатор из Keychain (iOS) или Keystore (Android). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  platform!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  appVersion?: string;
}

export class OpenSessionDto {
  /**
   * Обязателен для мобильного клиента. Веб-панель руководителей
   * заходит без него и к устройству не привязывается.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDescriptorDto)
  device?: DeviceDescriptorDto;
}
