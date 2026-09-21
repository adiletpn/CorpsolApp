import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /**
   * Обязателен для мобильного клиента. Веб-панель руководителей
   * логинится без него и к устройству не привязывается.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDescriptorDto)
  device?: DeviceDescriptorDto;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
